import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { title: '儀表板', icon: '▣', section: 'overview' },
  },
  {
    path: '/sessions',
    name: 'sessions',
    component: () => import('../views/SessionsView.vue'),
    meta: { title: '工作階段', icon: '▶', section: 'overview' },
  },
  {
    path: '/projects',
    name: 'projects',
    component: () => import('../views/ProjectsView.vue'),
    meta: { title: '專案管理', icon: '📁', section: 'workspace' },
  },
  {
    path: '/projects/:id',
    name: 'project-detail',
    component: () => import('../views/ProjectDetailView.vue'),
    meta: { title: '專案詳情', icon: '📁', section: 'workspace' },
  },
  {
    path: '/gates',
    name: 'gates',
    component: () => import('../views/GatesView.vue'),
    meta: { title: '審核關卡', icon: '◈', section: 'workspace' },
  },
  {
    path: '/tasks',
    name: 'tasks',
    component: () => import('../views/TaskBoardView.vue'),
    meta: { title: '任務看板', icon: '☰', section: 'workspace' },
  },
  {
    path: '/agents',
    name: 'agents',
    component: () => import('../views/AgentsView.vue'),
    meta: { title: '團隊', icon: '◉', section: 'workspace' },
  },
  {
    path: '/knowledge',
    name: 'knowledge',
    component: () => import('../views/KnowledgeView.vue'),
    meta: { title: '知識庫', icon: '📚', section: 'workspace' },
  },
  {
    path: '/harness',
    name: 'harness',
    component: () => import('../views/HarnessView.vue'),
    meta: { title: 'Harness', icon: '⚡', section: 'workspace' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { title: '設定', icon: '⚙', section: 'system' },
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
