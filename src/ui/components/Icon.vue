<script setup lang="ts">
// Lucide icons imported BY NAME (no whole-pack import, no string indexing
// into the full icon registry — bundle stays minimal).
import {
  ArrowLeft, Download, Bot, Brain, ChartColumn, Check, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, CircleDot, Copy, EllipsisVertical, History,
  Image as ImageIcon, Layers, LoaderCircle, MessageCircle, Monitor, Pencil,
  Plus, RefreshCw, Search, Send, Settings, Settings2, Sparkles, Square,
  Sun, Moon, Terminal, Trash2, Wrench, X, Bell, Keyboard, Accessibility,
  Smartphone, AppWindow, Info, PanelLeft, Paperclip, Languages, TriangleAlert,
} from '@lucide/vue';
import { computed, type FunctionalComponent } from 'vue';

const ICONS: Record<string, FunctionalComponent> = {
  'arrow-left': ArrowLeft, download: Download, bot: Bot, brain: Brain, 'chart-column': ChartColumn,
  check: Check, 'chevron-down': ChevronDown, 'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight, 'chevron-up': ChevronUp, 'circle-dot': CircleDot,
  copy: Copy, 'ellipsis-vertical': EllipsisVertical, history: History,
  image: ImageIcon, layers: Layers, 'loader-circle': LoaderCircle,
  'message-circle': MessageCircle, monitor: Monitor, pencil: Pencil, plus: Plus,
  'refresh-cw': RefreshCw, search: Search, send: Send, settings: Settings,
  'settings-2': Settings2, sparkles: Sparkles, square: Square, sun: Sun,
  moon: Moon, terminal: Terminal, 'trash-2': Trash2, wrench: Wrench, x: X,
  bell: Bell, keyboard: Keyboard, accessibility: Accessibility,
  smartphone: Smartphone, 'app-window': AppWindow, info: Info,
  'panel-left': PanelLeft, paperclip: Paperclip, languages: Languages,
  'triangle-alert': TriangleAlert,
};

const props = defineProps<{ name: string }>();
const comp = computed(() => ICONS[props.name]);
</script>

<template>
  <component :is="comp" v-if="comp" class="icon" aria-hidden="true" />
</template>
