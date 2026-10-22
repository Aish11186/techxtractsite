'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  Clock as ClockIcon,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  RotateCcw,
} from 'lucide-react';

interface DateTimePickerProps {
  value: string; // "YYYY-MM-DDTHH:mm" format
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  minDate?: string;
  className?: string;
}

export default function DateTimePicker({
  value,
  onChange,
  label,
  placeholder = 'Select date & time',
  required = false,
  minDate,
  className = '',
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'calendar' | 'watch'>('calendar');
  const [clockMode, setClockMode] = useState<'hours' | 'minutes'>('hours');

  // Internal state for staged edits
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    return value ? new Date(value).getFullYear() : new Date().getFullYear();
  });
  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    return value ? new Date(value).getMonth() : new Date().getMonth();
  });
  const [selectedDay, setSelectedDay] = useState<number>(() => {
    return value ? new Date(value).getDate() : new Date().getDate();
  });

  // Time state (12-hour format + AM/PM)
  const [hour12, setHour12] = useState<number>(() => {
    if (!value) return 10;
    const h = new Date(value).getHours();
    return h === 0 ? 12 : h > 12 ? h - 12 : h;
  });
  const [minute, setMinute] = useState<number>(() => {
    if (!value) return 0;
    return new Date(value).getMinutes();
  });
  const [period, setPeriod] = useState<'AM' | 'PM'>(() => {
    if (!value) return 'AM';
    return new Date(value).getHours() >= 12 ? 'PM' : 'AM';
  });

  const pickerRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<SVGSVGElement>(null);

  // Sync internal state when external value changes
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setSelectedYear(d.getFullYear());
        setSelectedMonth(d.getMonth());
        setSelectedDay(d.getDate());
        const h = d.getHours();
        setHour12(h === 0 ? 12 : h > 12 ? h - 12 : h);
        setMinute(d.getMinutes());
        setPeriod(h >= 12 ? 'PM' : 'AM');
      }
    }
  }, [value]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Format helpers
  const format24Hour = (h12: number, p: 'AM' | 'PM'): number => {
    if (p === 'AM') return h12 === 12 ? 0 : h12;
    return h12 === 12 ? 12 : h12 + 12;
  };

  const getIsoString = (y: number, m: number, d: number, h: number, min: number): string => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${y}-${pad(m + 1)}-${pad(d)}T${pad(h)}:${pad(min)}`;
  };

  const commitChanges = (y = selectedYear, m = selectedMonth, d = selectedDay, h = hour12, min = minute, p = period) => {
    const h24 = format24Hour(h, p);
    const iso = getIsoString(y, m, d, h24, min);
    onChange(iso);
  };

  const handleApply = () => {
    commitChanges();
    setIsOpen(false);
  };

  const handleSetNow = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const h = now.getHours();
    const min = now.getMinutes();
    const newH12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const newPeriod = h >= 12 ? 'PM' : 'AM';

    setSelectedYear(y);
    setSelectedMonth(m);
    setSelectedDay(d);
    setHour12(newH12);
    setMinute(min);
    setPeriod(newPeriod);

    commitChanges(y, m, d, newH12, min, newPeriod);
  };

  // Calendar calculations
  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = new Date(selectedYear, selectedMonth, 1).getDay(); // 0 is Sun
  const totalDays = daysInMonth(selectedYear, selectedMonth);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((prev) => prev - 1);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((prev) => prev + 1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
  };

  const handleDaySelect = (d: number) => {
    setSelectedDay(d);
    commitChanges(selectedYear, selectedMonth, d);
    // Smoothly switch to watch tab for fluid time picking
    setActiveTab('watch');
  };

  // Watch dial calculations
  const clockSize = 220;
  const center = clockSize / 2;
  const dialRadius = 82;

  // Compute angles for watch hands
  const hourAngle = ((hour12 % 12) + minute / 60) * 30; // 30 deg per hour
  const minuteAngle = minute * 6; // 6 deg per minute

  const handleClockDialClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!clockRef.current) return;
    const rect = clockRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - center;
    const y = e.clientY - rect.top - center;

    // Angle clockwise from 12 o'clock in degrees
    let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;

    if (clockMode === 'hours') {
      let h = Math.round(angle / 30);
      if (h === 0) h = 12;
      setHour12(h);
      commitChanges(selectedYear, selectedMonth, selectedDay, h, minute, period);
      // Automatically switch to minute mode
      setClockMode('minutes');
    } else {
      let m = Math.round(angle / 6);
      if (m >= 60) m = 0;
      setMinute(m);
      commitChanges(selectedYear, selectedMonth, selectedDay, hour12, m, period);
    }
  };

  // Display label
  const formattedDisplay = value
    ? (() => {
        try {
          const d = new Date(value);
          if (isNaN(d.getTime())) return '';
          return `${d.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })} • ${d.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })}`;
        } catch {
          return value;
        }
      })()
    : '';

  return (
    <div className={`relative ${className}`} ref={pickerRef}>
      {label && (
        <label className="block text-xs font-medium text-neutral-300 mb-1">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-left text-neutral-100 hover:border-neutral-500 focus:outline-hidden focus:border-blue-500 transition shadow-inner"
      >
        <div className="flex items-center gap-2 truncate">
          <CalendarIcon className="w-4 h-4 text-blue-400 shrink-0" />
          {formattedDisplay ? (
            <span className="font-medium text-white truncate">{formattedDisplay}</span>
          ) : (
            <span className="text-neutral-500">{placeholder}</span>
          )}
        </div>
        <ClockIcon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
      </button>

      {/* Popover Card */}
      {isOpen && (
        <div className="absolute z-50 left-0 mt-2 w-[340px] sm:w-[380px] rounded-2xl border border-neutral-700/80 bg-neutral-900/95 backdrop-blur-xl shadow-2xl p-4 text-neutral-100 animate-in fade-in zoom-in-95 duration-150">
          {/* Header Preview & Mode Tabs */}
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
            <div className="flex bg-neutral-950 rounded-lg p-0.5 border border-neutral-800">
              <button
                type="button"
                onClick={() => setActiveTab('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  activeTab === 'calendar'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                Calendar
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('watch')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  activeTab === 'watch'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <ClockIcon className="w-3.5 h-3.5" />
                Watch Dial
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* TAB 1: CALENDAR INTERFACE */}
          {activeTab === 'calendar' && (
            <div className="py-3">
              {/* Month Navigation */}
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-sm font-semibold text-white">
                  {monthNames[selectedMonth]} {selectedYear}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="p-1 rounded-md border border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-1 rounded-md border border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-neutral-400 mb-1">
                <span>Su</span>
                <span>Mo</span>
                <span>Tu</span>
                <span>We</span>
                <span>Th</span>
                <span>Fr</span>
                <span>Sa</span>
              </div>

              {/* Day Cells Grid */}
              <div className="grid grid-cols-7 gap-1 text-center">
                {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-8" />
                ))}

                {Array.from({ length: totalDays }).map((_, i) => {
                  const dayNum = i + 1;
                  const isSelected =
                    selectedDay === dayNum &&
                    new Date(value || '').getMonth() === selectedMonth &&
                    new Date(value || '').getFullYear() === selectedYear;

                  const isToday =
                    new Date().getDate() === dayNum &&
                    new Date().getMonth() === selectedMonth &&
                    new Date().getFullYear() === selectedYear;

                  return (
                    <button
                      key={`day-${dayNum}`}
                      type="button"
                      onClick={() => handleDaySelect(dayNum)}
                      className={`h-8 w-8 mx-auto rounded-lg text-xs font-medium transition flex items-center justify-center ${
                        isSelected
                          ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-500/30'
                          : isToday
                          ? 'border border-blue-500/80 text-blue-400 hover:bg-blue-950/40'
                          : 'text-neutral-200 hover:bg-neutral-800'
                      }`}
                    >
                      {dayNum}
                    </button>
                  );
                })}
              </div>

              {/* Quick Date Presets */}
              <div className="flex items-center gap-1.5 pt-3 mt-2 border-t border-neutral-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    setSelectedYear(today.getFullYear());
                    setSelectedMonth(today.getMonth());
                    setSelectedDay(today.getDate());
                    commitChanges(today.getFullYear(), today.getMonth(), today.getDate());
                  }}
                  className="px-2 py-1 rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const tom = new Date();
                    tom.setDate(tom.getDate() + 1);
                    setSelectedYear(tom.getFullYear());
                    setSelectedMonth(tom.getMonth());
                    setSelectedDay(tom.getDate());
                    commitChanges(tom.getFullYear(), tom.getMonth(), tom.getDate());
                  }}
                  className="px-2 py-1 rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextWeek = new Date();
                    nextWeek.setDate(nextWeek.getDate() + 7);
                    setSelectedYear(nextWeek.getFullYear());
                    setSelectedMonth(nextWeek.getMonth());
                    setSelectedDay(nextWeek.getDate());
                    commitChanges(nextWeek.getFullYear(), nextWeek.getMonth(), nextWeek.getDate());
                  }}
                  className="px-2 py-1 rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
                >
                  +1 Week
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: WATCH / CLOCK-FACE INTERFACE */}
          {activeTab === 'watch' && (
            <div className="py-2 flex flex-col items-center">
              {/* Digital Time Badge & AM/PM Switcher */}
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => setClockMode('hours')}
                    className={`text-xl font-bold font-mono transition px-1 rounded-md ${
                      clockMode === 'hours'
                        ? 'text-blue-400 bg-blue-950/60 ring-1 ring-blue-500/50'
                        : 'text-neutral-300 hover:text-white'
                    }`}
                  >
                    {hour12.toString().padStart(2, '0')}
                  </button>
                  <span className="text-xl font-bold text-neutral-500 mx-1">:</span>
                  <button
                    type="button"
                    onClick={() => setClockMode('minutes')}
                    className={`text-xl font-bold font-mono transition px-1 rounded-md ${
                      clockMode === 'minutes'
                        ? 'text-blue-400 bg-blue-950/60 ring-1 ring-blue-500/50'
                        : 'text-neutral-300 hover:text-white'
                    }`}
                  >
                    {minute.toString().padStart(2, '0')}
                  </button>
                </div>

                <div className="flex bg-neutral-950 border border-neutral-800 rounded-xl p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPeriod('AM');
                      commitChanges(selectedYear, selectedMonth, selectedDay, hour12, minute, 'AM');
                    }}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                      period === 'AM'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPeriod('PM');
                      commitChanges(selectedYear, selectedMonth, selectedDay, hour12, minute, 'PM');
                    }}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                      period === 'PM'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    PM
                  </button>
                </div>
              </div>

              {/* Mode Indicator Pill */}
              <div className="flex items-center gap-2 mb-2 text-[11px] text-neutral-400">
                <span>Select:</span>
                <button
                  type="button"
                  onClick={() => setClockMode('hours')}
                  className={`font-semibold underline-offset-4 ${
                    clockMode === 'hours' ? 'text-blue-400 underline' : 'hover:text-white'
                  }`}
                >
                  Hours (1-12)
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setClockMode('minutes')}
                  className={`font-semibold underline-offset-4 ${
                    clockMode === 'minutes' ? 'text-blue-400 underline' : 'hover:text-white'
                  }`}
                >
                  Minutes (0-59)
                </button>
              </div>

              {/* Interactive Watch Dial (SVG) */}
              <div className="relative select-none p-1">
                <svg
                  ref={clockRef}
                  width={clockSize}
                  height={clockSize}
                  className="cursor-pointer drop-shadow-xl"
                  onClick={handleClockDialClick}
                >
                  {/* Outer Watch Case / Stainless Bezel */}
                  <circle
                    cx={center}
                    cy={center}
                    r={dialRadius + 20}
                    fill="#0f1117"
                    stroke="#262a35"
                    strokeWidth="4"
                  />
                  <circle
                    cx={center}
                    cy={center}
                    r={dialRadius + 16}
                    fill="none"
                    stroke="#1e222d"
                    strokeWidth="1.5"
                  />

                  {/* Inner Dial Face */}
                  <circle
                    cx={center}
                    cy={center}
                    r={dialRadius + 12}
                    fill="#090a0f"
                    stroke="#171923"
                    strokeWidth="1"
                  />

                  {/* 60 Minute Tick Marks */}
                  {Array.from({ length: 60 }).map((_, i) => {
                    const isHourTick = i % 5 === 0;
                    const angle = (i * 6 - 90) * (Math.PI / 180);
                    const outerR = dialRadius + 10;
                    const innerR = isHourTick ? dialRadius + 2 : dialRadius + 6;
                    const x1 = center + innerR * Math.cos(angle);
                    const y1 = center + innerR * Math.sin(angle);
                    const x2 = center + outerR * Math.cos(angle);
                    const y2 = center + outerR * Math.sin(angle);
                    return (
                      <line
                        key={`tick-${i}`}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={isHourTick ? '#60a5fa' : '#334155'}
                        strokeWidth={isHourTick ? 1.8 : 0.8}
                      />
                    );
                  })}

                  {/* Clock Face Numbers */}
                  {clockMode === 'hours'
                    ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((num) => {
                        const angle = (num * 30 - 90) * (Math.PI / 180);
                        const numR = dialRadius - 8;
                        const x = center + numR * Math.cos(angle);
                        const y = center + numR * Math.sin(angle);
                        const isCurrent = hour12 === num;
                        return (
                          <g key={`num-${num}`}>
                            {isCurrent && (
                              <circle
                                cx={x}
                                cy={y}
                                r={13}
                                fill="#2563eb"
                                className="transition-all duration-150"
                              />
                            )}
                            <text
                              x={x}
                              y={y + 4}
                              textAnchor="middle"
                              fontSize={isCurrent ? '12' : '11'}
                              fontWeight={isCurrent ? 'bold' : '500'}
                              fill={isCurrent ? '#ffffff' : '#cbd5e1'}
                              className="pointer-events-none select-none transition-colors"
                            >
                              {num}
                            </text>
                          </g>
                        );
                      })
                    : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((mVal) => {
                        const angle = (mVal * 6 - 90) * (Math.PI / 180);
                        const numR = dialRadius - 8;
                        const x = center + numR * Math.cos(angle);
                        const y = center + numR * Math.sin(angle);
                        const isCurrent = minute === mVal;
                        return (
                          <g key={`min-${mVal}`}>
                            {isCurrent && (
                              <circle
                                cx={x}
                                cy={y}
                                r={13}
                                fill="#2563eb"
                                className="transition-all duration-150"
                              />
                            )}
                            <text
                              x={x}
                              y={y + 3.5}
                              textAnchor="middle"
                              fontSize={isCurrent ? '11' : '10'}
                              fontWeight={isCurrent ? 'bold' : '500'}
                              fill={isCurrent ? '#ffffff' : '#94a3b8'}
                              className="pointer-events-none select-none transition-colors"
                            >
                              {mVal.toString().padStart(2, '0')}
                            </text>
                          </g>
                        );
                      })}

                  {/* Hour Hand */}
                  <line
                    x1={center}
                    y1={center}
                    x2={center + 46 * Math.cos(((hourAngle - 90) * Math.PI) / 180)}
                    y2={center + 46 * Math.sin(((hourAngle - 90) * Math.PI) / 180)}
                    stroke={clockMode === 'hours' ? '#38bdf8' : '#94a3b8'}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    className="transition-all duration-200 ease-out"
                  />

                  {/* Minute Hand */}
                  <line
                    x1={center}
                    y1={center}
                    x2={center + 64 * Math.cos(((minuteAngle - 90) * Math.PI) / 180)}
                    y2={center + 64 * Math.sin(((minuteAngle - 90) * Math.PI) / 180)}
                    stroke={clockMode === 'minutes' ? '#38bdf8' : '#64748b'}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    className="transition-all duration-200 ease-out"
                  />

                  {/* Center Jewel / Pivot */}
                  <circle cx={center} cy={center} r="4.5" fill="#38bdf8" />
                  <circle cx={center} cy={center} r="2" fill="#ffffff" />
                </svg>
              </div>

              {/* Quick Preset Times */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2 mt-1 border-t border-neutral-800 text-[11px]">
                {[
                  { label: '09:00 AM', h: 9, m: 0, p: 'AM' as const },
                  { label: '10:30 AM', h: 10, m: 30, p: 'AM' as const },
                  { label: '02:00 PM', h: 2, m: 0, p: 'PM' as const },
                  { label: '05:00 PM', h: 5, m: 0, p: 'PM' as const },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setHour12(preset.h);
                      setMinute(preset.m);
                      setPeriod(preset.p);
                      commitChanges(selectedYear, selectedMonth, selectedDay, preset.h, preset.m, preset.p);
                    }}
                    className="px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Action Footer */}
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-neutral-800 text-xs">
            <button
              type="button"
              onClick={handleSetNow}
              className="flex items-center gap-1 text-neutral-400 hover:text-blue-400 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Set to Now
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className="px-2.5 py-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold text-white shadow-xs transition"
              >
                <Check className="w-3.5 h-3.5" />
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
