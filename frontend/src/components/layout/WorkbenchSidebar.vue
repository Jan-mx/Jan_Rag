<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import SessionLogoutButton from '../SessionLogoutButton.vue'
import { useAuthStore } from '../../stores/auth'

interface NavItem {
  to: string
  label: string
  caption: string
}

const route = useRoute()
const authStore = useAuthStore()

const businessNavItems: NavItem[] = [
  { to: '/groups', label: '知识空间', caption: '成员、权限与加入申请' },
  { to: '/documents', label: '资料中心', caption: '上传、解析、索引与预览' },
  { to: '/qa', label: '证据问答', caption: '单轮检索与来源核对' },
  { to: '/assistant', label: 'Jan 助手', caption: '多轮会话与知识库工具' },
]

const adminNavItems: NavItem[] = [
  { to: '/admin/overview', label: '运营总览', caption: '系统状态、风险与快捷入口' },
  { to: '/admin/users', label: '用户与权限', caption: '账号、角色与状态维护' },
]

const navItems = computed(() => (authStore.isAdmin ? adminNavItems : businessNavItems))
const currentUser = computed(() => authStore.currentUser)
const roleLabel = computed(() => (authStore.isAdmin ? '系统管理员' : '知识库成员'))
const accountSummary = computed(() => currentUser.value?.userCode ?? '未加载账号')
const statusLabel = computed(() => {
  if (currentUser.value === null) {
    return '正在同步当前账号'
  }
  return currentUser.value.mustChangePassword ? '需要修改初始密码' : '会话已连接'
})

function isActive(targetPath: string) {
  return route.path === targetPath || route.path.startsWith(`${targetPath}/`)
}
</script>

<template>
  <div class="workbench-sidebar">
    <RouterLink class="workbench-sidebar__brand" :to="authStore.homePath">
      <span class="workbench-sidebar__brand-mark" aria-hidden="true">JR</span>
      <span class="workbench-sidebar__eyebrow">Knowledge Workspace</span>
      <strong>Jan_Rag</strong>
      <span class="workbench-sidebar__brand-subtitle">证据优先的知识工作台</span>
      <span class="workbench-sidebar__brand-description">统一管理知识空间、文档入库、混合检索、问答引用和个人助手。</span>
      <span class="workbench-sidebar__brand-tag">Postgres / MinIO / ES / Agent</span>
    </RouterLink>

    <nav class="workbench-sidebar__nav" aria-label="系统导航">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="workbench-sidebar__nav-item"
        :class="{ 'is-active': isActive(item.to) }"
      >
        <strong>{{ item.label }}</strong>
        <span>{{ item.caption }}</span>
      </RouterLink>
    </nav>

    <div class="workbench-sidebar__user">
      <div class="workbench-sidebar__user-copy">
        <span class="workbench-sidebar__user-label">{{ roleLabel }}</span>
        <strong>{{ currentUser?.displayName ?? '未登录用户' }}</strong>
        <span>{{ accountSummary }}</span>
      </div>

      <div class="workbench-sidebar__status">
        <span class="workbench-sidebar__status-dot" aria-hidden="true" />
        <span>{{ statusLabel }}</span>
      </div>

      <div class="workbench-sidebar__actions">
        <RouterLink class="workbench-sidebar__security-link" to="/account/security">
          账号安全
        </RouterLink>
        <SessionLogoutButton class="workbench-sidebar__logout" />
      </div>
    </div>
  </div>
</template>
