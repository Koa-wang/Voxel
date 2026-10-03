<script setup lang="ts">
import { ref } from 'vue';
const count = ref(0);
</script>

<template>
  <main>
    <h1>UniBits + Vue 3</h1>
    <button @click="count++">count is {{ count }}</button>
  </main>
</template>

<style scoped>
main {
  font-family: system-ui, sans-serif;
  text-align: center;
  padding: 4rem;
}
button {
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  border-radius: 8px;
  cursor: pointer;
}
</style>
