# Acceptance / test plan

## 3 lið
- 4v4v4
- 4v4v5
- 5v5v5
- mark: winner stays, loser out, waiting in
- timeout: incumbent out
- first timeout: manual outgoing choice
- next game remains READY until Start

## 2 lið
- 4v4 og 5v5
- mark closes mini-game, same matchup READY
- timeout closes mini-game, same matchup READY
- no outgoing/incoming rotation

## Timer
- 03:00 -> 00:00
- pause freezes exactly
- resume continues remaining duration
- buzzer at 00:00
- reload while RUNNING recovers as PAUSED
- screen wake lock requested while live

## Events
- goal + scorer + assist
- goal without assist
- own goal, no assist
- scorer cannot assist self
- undo after goal restores set score / rotation / event
- 4th win closes set, increments set count, resets current wins

## Roles
- regular plays -> stats under regular table
- substitute plays -> stats under substitute table
- player promoted mid-season -> old sessions remain substitute; new sessions regular

## Offline
- start session online
- disable network
- record at least 10 mini-games
- close/reopen PWA and recover
- reconnect and sync
- cloud snapshot + normalized rows exist
