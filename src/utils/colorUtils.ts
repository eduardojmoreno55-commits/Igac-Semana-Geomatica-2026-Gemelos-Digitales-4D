/**
  Helper utilities for battery color scale (Green to Red)
  and metric styling.
 */

/**
 * Returns an HSL or Hex color for battery percentage based on a smooth green-to-red scale.
 * 100% -> Vibrant Green (#10b981 / hsl(140, 85%, 45%))
 * 50%  -> Amber Yellow (#f59e0b / hsl(45, 95%, 48%))
 * 0%   -> Red (#ef4444 / hsl(0, 85%, 50%))
 */
export function getBatteryColor(percentage: number): string {
  const pct = Math.max(0, Math.min(100, percentage));
  // Map 0..100% to hue 0 (red) .. 140 (green)
  const hue = (pct / 100) * 135;
  return `hsl(${hue}, 85%, 45%)`;
}

/**
 * Returns a CSS gradient for battery bar
 */
export function getBatteryGradient(percentage: number): string {
  const color = getBatteryColor(percentage);
  return `linear-gradient(90deg, ${color} 0%, ${getBatteryColor(Math.max(0, percentage - 15))} 100%)`;
}

/**
 * Returns text classification for battery status
 */
export function getBatteryStatusLabel(percentage: number): { label: string; class: string } {
  if (percentage >= 75) return { label: 'Óptima', class: 'status-green' };
  if (percentage >= 45) return { label: 'Adecuada', class: 'status-yellow' };
  if (percentage >= 20) return { label: 'Baja', class: 'status-orange' };
  return { label: 'Crítica', class: 'status-red' };
}

/**
 * Returns color for temperature
 */
export function getTemperatureColor(temp: number): string {
  if (temp < 25) return '#3b82f6'; // Cool blue
  if (temp <= 45) return '#10b981'; // Normal green
  if (temp <= 60) return '#f59e0b'; // Warm amber
  return '#ef4444'; // Hot red
}

/**
 * Returns color for speed
 */
export function getSpeedColor(speed: number): string {
  if (speed === 0) return '#9ca3af'; // Stationary
  if (speed < 40) return '#3b82f6'; // Normal urban
  if (speed < 65) return '#10b981'; // Fast urban
  return '#f59e0b'; // High speed
}
