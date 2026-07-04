<script type="application/json" def>
{
  "navigationBarTitleText": "SmartRun",
  "description": "SmartRun 起跑页：一键开始自由跑。进 HUD 后自动尝试连蓝牙心率(连不上就无蓝牙模式、无心率)，距离用眼镜 IMU 估算，零选择、零配置。"
}
</script>

<script setup>
import wx from 'wx';

// 极简起跑:不再让用户选模式(蓝牙/无蓝牙、户外/室内)。一律「自由跑」——
// 按「开始跑步」直接进 HUD 自动开跑;HUD 自己尝试连蓝牙心率,连不上就无蓝牙(无心率),
// 距离用眼镜 IMU 估算。尽量少操作。
export default {
  data: {
    subtitle: 'AI 跑步教练 · 一键自由跑',
  },

  startRun() {
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
    <view class="cta" bindtap="startRun">
      <text class="cta-txt">开始跑步</text>
    </view>
    <view class="cta-ghost" bindtap="openCoach">
      <text class="cta-ghost-txt">问教练</text>
    </view>
  </view>
</page>

<style>
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 18px 16px;
  background-color: #000000;
  border: 2px solid #143a20;
  border-radius: var(--radius-md, 12px);
}

.title {
  color: var(--color-primary, #40ff5e);
  font-size: 26px;
  line-height: 30px;
  font-weight: bold;
  text-align: center;
}

.subtitle {
  color: #8fe0a0;
  font-size: 12px;
  line-height: 16px;
  margin-top: 6px;
  text-align: center;
}

.cta {
  margin-top: 16px;
  min-width: 168px;
  padding: 11px 16px;
  background-color: var(--color-primary, #40ff5e);
  border-radius: var(--radius-md, 12px);
}

.cta-txt {
  color: #031106;
  font-size: 17px;
  line-height: 21px;
  font-weight: bold;
  text-align: center;
}

.cta-ghost {
  margin-top: 10px;
  min-width: 100px;
  padding: 8px 14px;
  background-color: #132117;
  border: 1px solid #24452f;
  border-radius: var(--radius-md, 12px);
}

.cta-ghost-txt {
  color: #8dffab;
  font-size: 14px;
  line-height: 18px;
  text-align: center;
}
</style>
