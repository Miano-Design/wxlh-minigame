# 网页版存档结构（自动生成：node scripts/audit-web.js）

> 唯一标准 = `js/core.js` 的 `defaultState()` 与读写函数。小游戏**必须复用同一份 core.js**（逐字节同步），
> 所以存档结构天然一致；这里列出字段清单，供迁移时核对"有没有漏字段"。

## 存档键
- `SAVE_KEY = 'wxlh_save_v5'`
- `localStorage.setItem(SAVE_KEY, JSON.stringify(S)`
- `localStorage.removeItem(SAVE_KEY)`
- `localStorage.getItem(SAVE_KEY)`
- `localStorage.setItem(slotKey(n)`
- `localStorage.getItem(slotKey(n)`
- `localStorage.getItem(slotKey(i)`

## defaultState() 顶层字段（共 43 个）
- `v`
- `createdAt`
- `player`
- `altPlayers`
- `bag`
- `cur`
- `chars`
- `party`
- `equips`
- `equipped`
- `items`
- `serums`
- `buildings`
- `auth`
- `sect`
- `keji`
- `travel`
- `garden`
- `arena`
- `fabao`
- `mount`
- `sign`
- `worlds`
- `worldFirstClear`
- `corridor`
- `recruit`
- `shop`
- `sweep`
- `tasks`
- `login`
- `idle`
- `bounty`
- `beast`
- `stats`
- `settings`
- `codex`
- `achievements`
- `presets`
- `pendingRun`
- `unlocks`
- `quests`
- `ssrTicket`
- `tutorial`

## 字段与默认值
| 字段 | 默认值 |
| --- | --- |
| `v` | `5` |
| `createdAt` | `Date.now()` |
| `player` | `Object.assign(freshProtagonist('执灯者')` |
| `altPlayers` | `[]` |
| `bag` | `{ itemCap: 50` |
| `cur` | `{ points: 0` |
| `chars` | `{}` |
| `party` | `['@player'` |
| `equips` | `{}` |
| `equipped` | `{ '@player': { weapon: null` |
| `items` | `{}` |
| `serums` | `{}` |
| `buildings` | `{ core: 1` |
| `auth` | `0` |
| `sect` | `{ lv: 1` |
| `keji` | `{}` |
| `travel` | `{ bankSec: 0` |
| `garden` | `Array(4).fill(null)` |
| `arena` | `{ floor: 1` |
| `fabao` | `{ own: []` |
| `mount` | `{ own: []` |
| `sign` | `{ date: ''` |
| `worlds` | `{}` |
| `worldFirstClear` | `{}` |
| `corridor` | `{ floor: 1` |
| `recruit` | `{ pity: { advanced: { ssr: 0` |
| `shop` | `{ dailyDate: ''` |
| `sweep` | `{ date: ''` |
| `tasks` | `{ date: ''` |
| `login` | `{ day: 0` |
| `idle` | `{ bankSec: 0` |
| `bounty` | `{ start: Date.now()` |
| `beast` | `{ owned: {}` |
| `stats` | `{ battles: 0` |
| `settings` | `{ speed: 1` |
| `codex` | `{ chars: []` |
| `achievements` | `{}` |
| `presets` | `[null` |
| `pendingRun` | `null` |
| `unlocks` | `{}` |
| `quests` | `{ claimed: [] }` |
| `ssrTicket` | `0` |
| `tutorial` | `false` |
