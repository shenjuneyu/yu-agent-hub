import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { titleKey: 'nav.dashboard', icon: '▣', section: 'overview' },
  },
  {
    path: '/sessions',
    name: 'sessions',
    component: () => import('../views/SessionsView.vue'),
    meta: { titleKey: 'nav.sessions', icon: '▶', section: 'overview' },
  },
  {
    path: '/projects',
    name: 'projects',
    component: () => import('../views/ProjectsView.vue'),
    meta: { titleKey: 'nav.projects', icon: '📁', section: 'workspace' },
  },
  {
    path: '/projects/:id',
    name: 'project-detail',
    component: () => import('../views/ProjectDetailView.vue'),
    meta: { titleKey: 'nav.projects', icon: '📁', section: 'workspace' },
  },
  {
    path: '/gates',
    name: 'gates',
    component: () => import('../views/GatesView.vue'),
    meta: { titleKey: 'gates.title', icon: '◈', section: 'workspace' },
  },
  {
    path: '/tasks',
    name: 'tasks',
    component: () => import('../views/TaskBoardView.vue'),
    meta: { titleKey: 'taskboard.title', icon: '☰', section: 'workspace' },
  },
  {
    path: '/messages',
    name: 'messages',
    component: () => import('../views/MessagesView.vue'),
    meta: { titleKey: 'messages.title', icon: '✉', section: 'workspace' },
  },
  {
    path: '/agents',
    name: 'agents',
    component: () => import('../views/AgentsView.vue'),
    meta: { titleKey: 'nav.agents', icon: '◉', section: 'workspace' },
  },
  {
    path: '/knowledge',
    name: 'knowledge',
    component: () => import('../views/KnowledgeView.vue'),
    meta: { titleKey: 'knowledge.title', icon: '📚', section: 'workspace' },
  },
  {
    path: '/harness',
    name: 'harness',
    component: () => import('../views/HarnessView.vue'),
    meta: { titleKey: 'harness.title', icon: '⚡', section: 'workspace' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { titleKey: 'nav.settings', icon: '⚙', section: 'system' },
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
