<script def>
{
  "navigationBarTitleText": "SmartRun",
  "description": "SmartRun 跑步助手入口：进入跑步 HUD"
}
</script>

<script setup>
export default {
  data: {
    subtitle: 'AI 跑步教练 · 眼镜直连蓝牙心率',
  },
  openHud() {
    wx.navigateTo({ url: '/pages/run_hud/index' });
  },
  openCoach() {
    wx.navigateTo({ url: '/pages/coach/index' });
  },
};
</script>

<page>
  <view class="container">
    <text class="title">SmartRun</text>
    <text class="subtitle">{{ subtitle }}</text>
    <button class="cta" bindtap="openHud">进入跑步 HUD</button>
    <button class="cta cta-ghost" bindtap="openCoach">问 AI 教练</button>
  </view>
</page>

<style>
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background-color: #000000;
  border: 2px solid #143a20;
  border-radius: var(--radius-md, 12px);
}

.title {
  color: var(--color-primary, #40ff5e);
  font-size: 28px;
  line-height: 32px;
  font-weight: bold;
  text-align: center;
}

.subtitle {
  color: #8fe0a0;
  font-size: 13px;
  line-height: 18px;
  margin-top: 6px;
  text-align: center;
}

.cta {
  margin-top: 16px;
  min-width: 160px;
  padding: 10px 14px;
  text-align: center;
  color: #031106;
  background-color: var(--color-primary, #40ff5e);
  border-radius: var(--radius-md, 12px);
  font-weight: bold;
}

.cta-ghost {
  margin-top: 10px;
  color: #8dffab;
  background-color: #132117;
  border: 1px solid #24452f;
}
</style>
