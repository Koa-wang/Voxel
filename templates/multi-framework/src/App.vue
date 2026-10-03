<script setup lang="ts">
import { ref } from 'vue';
import ReactWidget from './ReactWidget';
import SolidWidget from './SolidWidget';
const tab = ref<'vue' | 'react' | 'solid'>('vue');
</script>

<template>
  <main>
    <h1>UniBits Multi-Framework</h1>
    <div class="tabs">
      <button @click="tab = 'vue'">Vue</button>
      <button @click="tab = 'react'">React</button>
      <button @click="tab = 'solid'">Solid</button>
    </div>
    <ReactWidget v-if="tab === 'react'" />
    <SolidWidget v-else-if="tab === 'solid'" />
    <div v-else class="widget">Vue widget 🟢</div>
  </main>
</template>

<style scoped>
main { font-family: system-ui, sans-serif; text-align: center; padding: 4rem; }
.tabs { display: flex; gap: 8px; justify-content: center; margin-bottom: 2rem; }
button { padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; }
.widget { padding: 2rem; background: #42b88322; border-radius: 12px; }
</style>
