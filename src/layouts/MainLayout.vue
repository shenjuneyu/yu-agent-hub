<script setup lang="ts">
import SidebarNav from '../components/layout/SidebarNav.vue';
import TopBar from '../components/layout/TopBar.vue';
</script>

<template>
  <div class="flex h-screen bg-bg-primary">
    <!-- Spacer: keeps content from shifting when sidebar hovers -->
    <div class="w-[52px] min-w-[52px] flex-shrink-0"></div>
    <!-- Sidebar overlay -->
    <SidebarNav />
    <div class="flex flex-1 flex-col overflow-hidden">
      <TopBar />
      <main class="flex-1 overflow-y-auto p-6">
        <RouterView v-slot="{ Component }">
          <KeepAlive include="SessionsView">
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </main>
    </div>
  </div>
</template>
