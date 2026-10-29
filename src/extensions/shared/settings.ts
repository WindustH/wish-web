import { tr } from '../../core/i18n/tr.ts';
export const categoryDefinitions = () =>
  [
    {
      id: 'image_generation',
      toolKey: 'image_generate',
      icon: 'image',
      label: tr('图片生成', 'Image generation'),
      summary: tr('生图服务、模型与账户', 'Image services, models and accounts'),
      description: tr('生成图片并保存到会话 blob。', 'Generate images into session blob storage.'),
    },
    {
      id: 'video_generation',
      toolKey: 'video_generate',
      icon: 'video',
      label: tr('视频生成', 'Video generation'),
      summary: tr('视频服务、模型与账户', 'Video services, models and accounts'),
      description: tr(
        '生成任务可继续查询，完成后保存到会话。',
        'Resume generation task queries and store completed videos in the session.',
      ),
    },
    {
      id: 'audio_generation',
      toolKey: 'audio_generate',
      icon: 'audio',
      label: tr('音频生成', 'Audio generation'),
      summary: tr('配音、音乐与音效', 'Speech, music and sound effects'),
      description: tr('按用途选择音频生成服务与默认音色。', 'Choose audio services and default voices by purpose.'),
    },
    {
      id: 'audio_transcription',
      toolKey: 'audio_transcribe',
      icon: 'mic',
      label: tr('语音转写', 'Transcription'),
      summary: tr('ASR 服务与账户', 'ASR services and accounts'),
      description: tr('将会话音频或视频中的语音转为文字。', 'Transcribe speech from session audio or video files.'),
    },
    {
      id: 'fetch',
      toolKey: 'web_fetch',
      icon: 'web-reader',
      label: tr('网页读取', 'Web fetch'),
      summary: tr('网页内容读取服务', 'Page reading services'),
      description: tr('独立选择网页读取提供商及其账户。', 'Configure webpage readers and their accounts.'),
    },
    {
      id: 'search',
      toolKey: 'web_search',
      icon: 'web-search',
      label: tr('联网搜索', 'Web search'),
      summary: tr('Web Search 用哪些搜索服务', 'The services Web Search asks'),
      description: tr(
        'Web Search 工具按顺序询问这些搜索提供商。各服务可以复用公共账户池中的凭据。',
        'The Web Search tool asks these providers in order. Services can share credentials from the account pool.',
      ),
    },
  ] as const;

export type ExtensionCategory = ReturnType<typeof categoryDefinitions>[number]['id'];
