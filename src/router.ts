import { createRouter, createWebHistory } from 'vue-router';
import HomePage from './pages/HomePage.vue';
import AdminLayout from './layouts/AdminLayout.vue';
import AdminLogin from './pages/admin/Login.vue';
import AdminOverview from './pages/admin/Overview.vue';
import AdminBookmarks from './pages/admin/Bookmarks.vue';
import AdminCategories from './pages/admin/Categories.vue';
import AdminBackup from './pages/admin/Backup.vue';
import AdminSettings from './pages/admin/Settings.vue';
import AdminAccount from './pages/admin/Account.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    {
      path: '/admin',
      component: AdminLayout,
      redirect: '/admin/overview',
      meta: { requiresAuth: true },
      children: [
        { path: 'overview', name: 'admin-overview', component: AdminOverview },
        { path: 'bookmarks', name: 'admin-bookmarks', component: AdminBookmarks },
        { path: 'categories', name: 'admin-categories', component: AdminCategories },
        { path: 'backup', name: 'admin-backup', component: AdminBackup },
        { path: 'settings', name: 'admin-settings', component: AdminSettings },
        { path: 'account', name: 'admin-account', component: AdminAccount }
      ]
    },
    { path: '/admin/login', name: 'admin-login', component: AdminLogin }
  ],
  scrollBehavior() {
    return { top: 0 };
  }
});

// 路由守卫
router.beforeEach((to, from, next) => {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('bookmark_token') : null;
  const isAuthenticated = Boolean(token);

  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/admin/login');
  } else if (to.path === '/admin/login' && isAuthenticated) {
    next('/admin');
  } else {
    next();
  }
});

