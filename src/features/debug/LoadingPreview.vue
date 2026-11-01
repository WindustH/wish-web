<script setup lang="ts">
import LoadingState from '../../ui/components/LoadingState.vue';
import Icon from '../../ui/components/Icon.vue';
import { i18n } from '../../core/i18n/index.ts';
import { tr } from '../../core/i18n/tr.ts';
</script>
<template>
  <div class="loading-preview">
    <p class="hint">
      {{
        tr(
          '保持加载状态，方便检查动画、留白和对比度。跟随当前主题和窄栏设置。',
          'Loading states stay visible to inspect motion, spacing and contrast. Uses the current theme and column width.',
        )
      }}
    </p>
    <h4>{{ tr('工具结果 · 图片读取', 'Tool result · Loading image') }}</h4>
    <figure class="tool-frame" data-loading="image">
      <LoadingState variant="inline" :label="tr('正在读取图片…', 'Loading image…')" />
      <figcaption>image.png</figcaption>
    </figure>
    <h4>{{ tr('侧栏 · 图片 / 音视频 / 文本准备', 'Sidebar · Preparing images, media and text') }}</h4>
    <div class="media-frame" data-loading="media">
      <LoadingState :label="i18n.t('common.loading')" />
    </div>
    <h4>{{ tr('PDF · 首次加载', 'PDF · Initial loading') }}</h4>
    <div class="pdf-frame" data-loading="pdf">
      <LoadingState variant="overlay" :label="i18n.t('common.loading')" />
    </div>
    <h4>{{ tr('PDF · 翻页等待（保留上一页）', 'PDF · Loading a page (previous page retained)') }}</h4>
    <div class="pdf-frame" data-loading="pdf-page">
      <div class="pdf-toolbar">
        <Icon name="bookmark" /><Icon name="chevron-left" /><span>2 / 12</span><Icon name="chevron-right" />
      </div>
      <div class="page-sample" aria-hidden="true"><span v-for="n in 6" :key="n" /></div>
      <LoadingState variant="overlay" :label="i18n.t('common.loading')" />
    </div>
    <h4>{{ tr('对话记录 · 初次加载', 'Conversation · Initial loading') }}</h4>
    <div
      class="history-skeleton"
      role="status"
      :aria-label="i18n.t('common.loading')"
      aria-busy="true"
      data-loading="history"
    >
      <div class="chat-skeleton skeleton-user" aria-hidden="true" />
      <div class="skeleton-reply" aria-hidden="true"><span v-for="n in 3" :key="n" class="chat-skeleton" /></div>
    </div>
    <h4>{{ tr('库 · 刷新与上传按钮', 'Library · Refresh and upload buttons') }}</h4>
    <div class="button-samples" data-loading="buttons">
      <button class="btn ghost icon-only" disabled :aria-label="tr('正在刷新', 'Refreshing')" aria-busy="true">
        <Icon name="refresh-cw" class="spin" />
      </button>
      <button class="btn ghost icon-only" disabled :aria-label="tr('正在上传', 'Uploading')" aria-busy="true">
        <Icon name="loader-circle" class="spin" />
      </button>
    </div>
  </div>
</template>
<style scoped>
h4 {
  margin: 24px 0 10px;
  color: var(--fg-subtle);
  font-size: 12px;
  font-weight: 500;
}
.tool-frame {
  margin: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
figcaption {
  padding: 10px 12px;
  font-size: 12px;
  color: var(--fg-subtle);
}
.media-frame {
  display: flex;
  min-height: 180px;
  padding: 12px;
}
.pdf-frame {
  position: relative;
  min-height: 200px;
  background: var(--bg-sunken);
  border-radius: 10px;
  overflow: hidden;
}
.pdf-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding-inline: 8px;
  background: var(--bg);
  font-size: 12px;
}
.page-sample {
  margin: 8px auto;
  padding: 32px 20px;
  width: 70%;
  min-height: 180px;
  background: white;
}
.page-sample span {
  display: block;
  height: 3px;
  margin: 12px 0;
  background: #ccc;
}
.page-sample span:last-child {
  width: 60%;
}
.history-skeleton {
  min-height: 180px;
}
.button-samples {
  display: flex;
  gap: 8px;
}
@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
