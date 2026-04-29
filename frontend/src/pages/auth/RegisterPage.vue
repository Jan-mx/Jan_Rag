<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { extractApiError } from '../../api/http'
import { register } from '../../api/auth'
import '../../assets/login-page.css'
import AuthSplitShell from '../../components/auth/AuthSplitShell.vue'

const router = useRouter()

const form = reactive({
  username: '',
  email: '',
  displayName: '',
  password: '',
  confirmPassword: '',
})

const pageError = ref('')
const isSubmitting = ref(false)

async function handleSubmit() {
  pageError.value = ''

  if (
    form.username.trim().length === 0 ||
    form.email.trim().length === 0 ||
    form.displayName.trim().length === 0 ||
    form.password.length === 0
  ) {
    pageError.value = '请填写完整注册信息'
    return
  }

  if (form.password !== form.confirmPassword) {
    pageError.value = '两次输入的密码不一致'
    return
  }

  isSubmitting.value = true
  try {
    await register({
      username: form.username.trim(),
      email: form.email.trim(),
      displayName: form.displayName.trim(),
      password: form.password,
    })
    await router.replace({ path: '/login', query: { registered: '1' } })
  } catch (error) {
    pageError.value = extractApiError(error, '注册失败')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <AuthSplitShell
    class="login-page auth-page--register"
    eyebrow="Create Jan_Rag account"
    title="加入 Jan_Rag"
    description="创建账号后，你可以申请加入已有知识空间，或创建自己的团队知识库。账号创建不会自动授予任何组权限。"
  >
    <template #brand>
      <div class="auth-brand-stack">
        <ul class="auth-brand-list" aria-label="注册规则">
          <li>
            <strong>默认角色是 USER</strong>
            <span>注册后只拥有基础业务身份，不会直接进入管理员入口。</span>
          </li>
          <li>
            <strong>知识空间需要授权</strong>
            <span>加入、邀请和审批仍由空间 OWNER 管理，避免文档被错误共享。</span>
          </li>
          <li>
            <strong>密码遵循 BCrypt 限制</strong>
            <span>至少 8 位并同时包含字母和数字，输入长度不超过 72 字节。</span>
          </li>
        </ul>
      </div>
    </template>

    <section class="auth-panel" aria-labelledby="register-title">
      <div class="auth-panel__header">
        <p class="auth-panel__eyebrow">Create account</p>
        <h2 id="register-title" class="auth-panel__title">注册账号</h2>
        <p class="auth-panel__hint">填写基础资料后创建账号，成功后会自动返回登录页。</p>
      </div>

      <form class="auth-form" @submit.prevent="handleSubmit">
        <label class="auth-form__field">
          <span>用户名</span>
          <input v-model="form.username" type="text" autocomplete="username" maxlength="64" placeholder="例如：jan-user" />
        </label>

        <label class="auth-form__field">
          <span>邮箱</span>
          <input v-model="form.email" type="email" autocomplete="email" maxlength="128" placeholder="jan@example.com" />
        </label>

        <label class="auth-form__field">
          <span>显示名称</span>
          <input v-model="form.displayName" type="text" maxlength="128" placeholder="例如：Jan" />
        </label>

        <label class="auth-form__field">
          <span>密码</span>
          <input v-model="form.password" type="password" autocomplete="new-password" maxlength="128" placeholder="至少 8 位，包含字母和数字" />
        </label>

        <label class="auth-form__field">
          <span>确认密码</span>
          <input v-model="form.confirmPassword" type="password" autocomplete="new-password" maxlength="128" placeholder="再次输入密码" />
        </label>

        <p v-if="pageError" class="auth-form__error" role="alert">
          {{ pageError }}
        </p>

        <button class="auth-form__submit" type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? '注册中...' : '创建账号' }}
        </button>
      </form>

      <div class="auth-panel__footer">
        <span>已有账号？</span>
        <RouterLink class="auth-page-link" to="/login">返回登录</RouterLink>
      </div>
    </section>
  </AuthSplitShell>
</template>
