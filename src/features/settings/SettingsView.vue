<script setup lang="ts">
import { ref, watch } from 'vue';
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui';
import { Monitor, Server, Network } from '@lucide/vue';
import ConfigEditor from './ConfigEditor.vue';
import UiSettings from './UiSettings.vue';
import { tr } from './fields';
import './settings.css';

const tab = ref('ui');
const scroll = ref<HTMLElement>();
watch(tab, () => scroll.value!.scrollTo({ top: 0, behavior: 'instant' }), { flush: 'post' });
</script>

<template>
  <div class="page settings-page">
    <div ref="scroll" class="settings-scroll">
      <div class="settings-frame">
        <TabsRoot v-model="tab" class="settings-root" :unmount-on-hide="true">
          <TabsList class="settings-tabs" :aria-label="tr('设置分类', 'Settings categories')">
            <TabsTrigger value="ui" class="settings-tab"><Monitor :size="18" />{{ tr('界面', 'Interface') }}</TabsTrigger>
            <TabsTrigger value="wishd" class="settings-tab"><Server :size="18" />wishd</TabsTrigger>
            <TabsTrigger value="providerd" class="settings-tab"><Network :size="18" />wish-providerd</TabsTrigger>
          </TabsList>
          <TabsContent value="ui" class="settings-panel"><UiSettings /></TabsContent>
          <TabsContent value="wishd" class="settings-panel"><ConfigEditor owner="wishd" /></TabsContent>
          <TabsContent value="providerd" class="settings-panel"><ConfigEditor owner="providerd" /></TabsContent>
        </TabsRoot>
      </div>
    </div>
    <div id="settings-actions" class="settings-actions" />
  </div>
</template>
