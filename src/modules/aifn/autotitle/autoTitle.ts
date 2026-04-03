import { aixChatGenerateText_Simple } from '~/modules/aix/client/aix.client';
import type { DLLMId } from '~/common/stores/llms/llms.types';

import { excludeSystemMessages } from '~/common/stores/chat/chat.conversation';
import { getConversation, useChatStore } from '~/common/stores/chat/store-chats';
import { getDomainModelIdOrThrow } from '~/common/stores/llms/store-llms';
import { messageFragmentsReduceText } from '~/common/stores/chat/chat.message';


/**
 * Creates the AI titles for conversations, by taking the last 5 first-lines and asking AI what's that about
 * @returns true if the title was actually replaced (for instance, it may not be needed)
 */
export async function autoConversationTitle(conversationId: string, forceReplace: boolean): Promise<boolean> {

  // 1. Select the models to try: fastUtil first, then primaryChat
  const tryLlmIds: DLLMId[] = [];
  try {
    const fastId = getDomainModelIdOrThrow(['fastUtil'], false, false, 'conversation-titler');
    if (fastId) tryLlmIds.push(fastId);
  } catch (e) { /* ignore */ }
  try {
    const primaryId = getDomainModelIdOrThrow(['primaryChat'], false, false, 'conversation-titler');
    if (primaryId && !tryLlmIds.includes(primaryId)) tryLlmIds.push(primaryId);
  } catch (e) { /* ignore */ }

  if (!tryLlmIds.length) return false;

  // 2. Validation & State
  const conversation = getConversation(conversationId);
  if (!conversation || (!forceReplace && (conversation.autoTitle || conversation.userTitle)))
    return false;

  const history = excludeSystemMessages(conversation.messages);
  if (history.length < 1) return false;

  const { setAutoTitle, setUserTitle } = useChatStore.getState();
  if (forceReplace) {
    setUserTitle(conversationId, '');
  }

  // 3. Prepare Prompt
  const historyLines: string[] = history.slice(-5).map(m => {
    const messageText = messageFragmentsReduceText(m.fragments);
    let text = messageText.split('\n')[0];
    text = text.length > 100 ? text.substring(0, 100) + '...' : text;
    text = `${m.role === 'user' ? 'You' : 'Assistant'}: ${text}`;
    return `- ${text}`;
  });

  // 4. Execution Loop (with Quota Fallback)
  for (const llmId of tryLlmIds) {
    try {
      let title = await aixChatGenerateText_Simple(
        llmId,
        '你是一个专门负责为对话生成精简标题的 AI 助手。',
        `请分析以下简短的对话记录片段，并提取一个能够概括对话核心内容的简短中文标题。

要求：
1. 标题必须简短、精练，通常在 2-6 个字以内。
2. 严禁包含任何标点符号。
3. 严禁包含任何 Markdown 格式或代码块（如 \`\`\`）。
4. 严禁包含 HTML 标签。
5. 只输出标题文本本身，不要有任何前缀或后缀。

对话片段：
\`\`\`
${historyLines.join('\n')}
\`\`\``,
        'chat-ai-title', conversationId,
      );

      // Clean up the title: remove quotes, markdown backticks, common prefixes, and HTML-like tags
      title = title?.trim()
        ?.replace(/^["'“”]*(.*?)["'“”]*$/, '$1') // remove wrapping quotes
        ?.replace(/[`*#]/g, '')                // remove markdown characters
        ?.replace(/^[Tt]itle:\s*/, '')         // remove "Title: " prefix
        ?.replace(/<[^>]*>?/gm, '')            // remove anything that looks like an HTML tag
        ?.replace(/\n+/g, ' ')                 // replace newlines with spaces
        ?.trim();

      if (title) {
        // limit title length to avoid extreme cases
        if (title.length > 20) title = title.substring(0, 19) + '...';
        setAutoTitle(conversationId, title);
        return true;
      }
    } catch (error: any) {
      const errorText = error?.message || error?.toString() || '';
      const isQuotaError = errorText.includes('403') || errorText.includes('quota') || errorText.includes('limit');

      // If it's a quota error and we have more models to try, continue to the next one
      if (isQuotaError && llmId !== tryLlmIds[tryLlmIds.length - 1]) {
        console.warn(`Auto-title: Quota limit on ${llmId}, trying fallback...`);
        continue;
      }

      // Otherwise log and break
      console.log('Failed to auto-title conversation', conversationId, { error });
      break;
    }
  }

  return false;
}