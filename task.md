# Stage 3 Build Tasks: Daily Attendance & HR Metrics Compact Redesign

- [x] 1. Update `src/app/(routes)/hr/HRClient.tsx` - enforce `min-w-0`, `truncate` on labels, and `whitespace-nowrap shrink-0` on values across all KPI summary cards.
- [x] 2. Update `src/components/hr/DailyAttendance.tsx` - compact header into sleek single-line bar with compact count badges.
- [x] 3. Update `src/components/hr/DailyAttendance.tsx` - reduce table rows to `py-1.5 px-3`, avatars to `w-7 h-7`, status badges to micro pills.
- [x] 4. Update `src/components/hr/DailyAttendance.tsx` - replace presence buttons with high-density segmented control (`w-7 h-7` buttons, `w-3.5 h-3.5` icons).
- [x] 5. Update `src/components/hr/DailyAttendance.tsx` - compact financial adjustments button and popover without clipping.
- [x] 6. Enforce viewport containment (`max-h-[calc(100vh-270px)]`) with sticky table headers so all rows fit on screen.
