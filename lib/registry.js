// 设备识别与「优雅失败」：按广播的标准 GATT 服务分类设备能力。
// Apple Watch 这类不广播标准服务的设备 → 明确提示，而非崩溃/静默。

const BASE_UUID_SUFFIX = '-0000-1000-8000-00805f9b34fb';

/** 16-bit 别名（0x180D / '180d' / 'heart_rate'）→ 规范 128-bit UUID。 */
export function canonicalUuid(id) {
  if (typeof id === 'number') {
    return `0000${id.toString(16).padStart(4, '0')}${BASE_UUID_SUFFIX}`.toLowerCase();
  }
  const s = String(id).toLowerCase();
  const named = {
    heart_rate: 0x180d,
    running_speed_and_cadence: 0x1814,
    cycling_speed_and_cadence: 0x1816,
    cycling_power: 0x1818,
    fitness_machine: 0x1826,
    pulse_oximeter: 0x1822,
    battery_service: 0x180f,
    device_information: 0x180a,
  };
  if (s in named) return canonicalUuid(named[s]);
  if (/^(0x)?[0-9a-f]{4}$/.test(s)) return canonicalUuid(parseInt(s.replace('0x', ''), 16));
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) return s;
  return null;
}

const CAPABILITIES = [
  { uuid16: 0x180d, key: 'heartRate', label: '心率' },
  { uuid16: 0x1814, key: 'runningSpeedCadence', label: '跑步速度/步频' },
  { uuid16: 0x1816, key: 'cyclingSpeedCadence', label: '骑行速度/踏频' },
  { uuid16: 0x1818, key: 'cyclingPower', label: '骑行功率' },
  { uuid16: 0x1826, key: 'fitnessMachine', label: '健身器械' },
  { uuid16: 0x1822, key: 'pulseOximeter', label: '血氧' },
];

/**
 * 广播服务列表 → 能力分类。
 * @returns {{supported:boolean, capabilities:string[], labels:string[], message:string}}
 */
export function classifyDevice(serviceUuids, deviceName = '') {
  const canon = new Set((serviceUuids || []).map(canonicalUuid).filter(Boolean));
  const caps = CAPABILITIES.filter((c) => canon.has(canonicalUuid(c.uuid16)));

  if (caps.length === 0) {
    return {
      supported: false,
      capabilities: [],
      labels: [],
      message: `${deviceName || '该设备'}未开放标准蓝牙运动服务（如 Apple Watch 不对第三方广播心率），请改用支持标准心率广播的设备`,
    };
  }
  return {
    supported: true,
    capabilities: caps.map((c) => c.key),
    labels: caps.map((c) => c.label),
    message: `支持：${caps.map((c) => c.label).join(' / ')}`,
  };
}
