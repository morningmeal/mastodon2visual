import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react' // 📌 [수복] plugin과 react의 위치를 올바르게 교정했습니다.

export default defineConfig({
  plugins: [react()],
  // 📌 본인의 깃허브 저장소(Repository) 이름을 적어주신 곳입니다. 예: '/mastodon2visual/'
  base: '/mastodon2visual/', 
})