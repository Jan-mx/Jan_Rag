<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { extractApiError } from '../../api/http'
import '../../assets/login-page.css'
import AuthSplitShell from '../../components/auth/AuthSplitShell.vue'
import { useAuthStore } from '../../stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const form = reactive({
  loginId: '',
  password: '',
})

const pageError = ref('')
const pageNotice = ref('')
const isBootstrapping = ref(false)

onMounted(() => {
  pageNotice.value = route.query.registered === '1' ? '注册成功，请使用新账号登录。' : ''
  void redirectAuthenticatedUser()
})

async function redirectAuthenticatedUser() {
  isBootstrapping.value = true
  try {
    const currentUser = await authStore.bootstrap()
    if (currentUser !== null) {
      await router.replace(authStore.resolveLandingPath(readRedirectQuery()))
    }
  } finally {
    isBootstrapping.value = false
  }
}

async function handleSubmit() {
  pageError.value = ''

  if (form.loginId.trim().length === 0 || form.password.length === 0) {
    pageError.value = '请输入账号和密码'
    return
  }

  try {
    await authStore.login({
      loginId: form.loginId,
      password: form.password,
    })
    await router.replace(authStore.resolveLandingPath(readRedirectQuery()))
  } catch (error) {
    pageError.value = extractApiError(error, '登录失败，请检查账号或密码')
  }
}

function readRedirectQuery(): string | null {
  const redirect = route.query.redirect
  return Array.isArray(redirect) ? (redirect[0] ?? null) : (redirect ?? null)
}
</script>

<template>
  <AuthSplitShell
    class="login-page auth-page--login"
    eyebrow="Jan_Rag Workspace"
    title="Jan_Rag"
    description="面向团队知识库的检索增强工作台。登录后可进入知识空间、资料中心、证据问答和 Jan 智能助手，继续使用旧库中的用户、文档、向量和索引数据。"
  >
    <template #brand>
      <div class="auth-brand-stack">
        <div class="auth-brand-chip-row" aria-label="平台能力">
          <span>pgvector semantic search</span>
          <span>Elasticsearch keyword search</span>
          <span>LangGraph.js assistant</span>
        </div>

        <div class="auth-brand-stat-grid">
          <article class="auth-brand-stat">
            <strong>旧数据可读</strong>
            <span>继续复用原有 Postgres、MinIO、Elasticsearch 与 Ollama 数据卷。</span>
          </article>
          <article class="auth-brand-stat">
            <strong>证据优先</strong>
            <span>问答结果围绕当前知识空间检索，并保留引用来源。</span>
          </article>
          <article class="auth-brand-stat">
            <strong>会话连续</strong>
            <span>Assistant 会话、消息和上下文仍写入业务表，便于追踪。</span>
          </article>
        </div>
      </div>
    </template>

    <section class="auth-panel" aria-labelledby="login-title">
      <div class="auth-panel__header">
        <p class="auth-panel__eyebrow">Secure sign in</p>
        <h2 id="login-title" class="auth-panel__title">登录 Jan_Rag</h2>
        <p class="auth-panel__hint">支持用户名或邮箱登录，成功后会按照你的角色进入对应工作台。</p>
      </div>

      <form class="auth-form" @submit.prevent="handleSubmit">
        <label class="auth-form__field">
          <span>账号</span>
          <input
            v-model="form.loginId"
            type="text"
            autocomplete="username"
            maxlength="100"
            placeholder="用户名或邮箱"
            :disabled="authStore.isAuthenticating || isBootstrapping"
          />
        </label>

        <label class="auth-form__field">
          <span>密码</span>
          <input
            v-model="form.password"
            type="password"
            autocomplete="current-password"
            maxlength="128"
            placeholder="输入密码"
            :disabled="authStore.isAuthenticating || isBootstrapping"
          />
        </label>

        <p v-if="pageError" class="auth-form__error" role="alert">
          {{ pageError }}
        </p>
        <p v-if="pageNotice" class="auth-form__notice">
          {{ pageNotice }}
        </p>

        <button
          class="auth-form__submit"
          type="submit"
          :disabled="authStore.isAuthenticating || isBootstrapping"
        >
          {{ authStore.isAuthenticating ? '登录中...' : '进入 Jan_Rag' }}
        </button>
      </form>

      <div class="auth-panel__footer">
        <span>还没有账号？</span>
        <RouterLink class="auth-page-link" to="/register">创建新账号</RouterLink>
      </div>
    </section>
  </AuthSplitShell>
</template>
