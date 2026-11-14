import type { Dictionary, Locale } from "@/i18n/dictionaries";
import { getChatConfig } from "@/lib/chatbot";
import { isVoiceEnabled } from "@/lib/voice-agent";
import { ChatWidget } from "./chat-widget";
import { VoiceAssistant } from "./voice-assistant";
import { WhatsAppFab } from "./whatsapp-fab";

/** The inquiry bot when it is switched on in the admin panel, otherwise the WhatsApp button */
export async function ChatLauncher({ lang, t }: { lang: Locale; t: Dictionary }) {
  const config = await getChatConfig(lang);
  if (!config.enabled) return <WhatsAppFab lang={lang} />;
  return <ChatWidget lang={lang} config={config} labels={t.chat} />;
}

/** The microphone button, shown once the Claude API key is set (see .env.example) */
export function VoiceLauncher({ lang, t }: { lang: Locale; t: Dictionary }) {
  if (!isVoiceEnabled()) return null;
  return <VoiceAssistant lang={lang} labels={t.voice} />;
}
