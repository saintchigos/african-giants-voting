# African Giants — The Last Dance 🏆

Awards-voting web app for **African Giants — The Last Dance**. Residents vote for
their favourite nominees across award categories from their phones; an admin panel
manages awards, nominees, and votes.

The backend is **Google Apps Script** (`Code.gs`) backed by a **Google Spreadsheet**,
and the frontend is a single `index.html` page.

## How voting works

- Each **room** has a max vote entitlement:
  - Single rooms (**77–153**, see list in `Code.gs`) → 1 vote
  - Double rooms → 2 votes
  - Room 100 → special case, 1 vote
- The app checks a room before voting (`checkRoom`): if the room already used its
  votes, further attempts are **flagged** (`FLAGGED`) so organizers can review.
- Votes are one per voter per award; results only count votes from un-flagged voters.

## Features

- Public voting by room (no login — room-based eligibility)
- Award categories + nominees with images and emoji
- Automatic over-vote flagging per room
- Admin panel: add/remove awards & nominees, view results, manage/remove voters,
  clear flags
- Live results computed from the spreadsheet

## Setup (deploy the backend)

1. Go to <https://script.google.com>, create a new project.
2. Paste the **entire** contents of `Code.gs` into the editor.
3. Create a linked Google Spreadsheet (Script Editor → Insert → Google Sheet).
4. Deploy → **Web app** (Execute as: **Me**, Who has access: **Anyone**).
5. Note the `/exec` URL and point the frontend at it (see `index.html`, API base URL).
6. Host `index.html` anywhere (GitHub Pages, etc.).

> On first run the script auto-creates the `Awards`, `Nominees`, `Voters` and
> `Votes` sheets with the right headers.

## Admin

- Admin actions require the password defined as `ADMIN_PASSWORD` in `Code.gs`
  (change it before deploying).
- Admin functions: `getResults`, `getVoters`, `getFlagged`, `addAward`,
  `removeAward`, `addNominee`, `removeNominee`, `removeVoter`, `clearFlag`.

## API overview

| Action | Method | Access | Purpose |
|---|---|---|---|
| `getAwards` | GET | public | List awards + nominees |
| `checkRoom` | GET | public | Check room eligibility & max votes |
| `submitVote` | POST | public | Cast a voter's votes |
| `getResults` | GET | admin | Vote counts per nominee |
| `getVoters` | GET | admin | All voters, newest first |
| `getFlagged` | GET | admin | Rooms that exceeded their vote limit |
| `addAward` / `removeAward` | POST | admin | Manage award categories |
| `addNominee` / `removeNominee` | POST | admin | Manage nominees |
| `removeVoter` / `clearFlag` | POST | admin | Correct bad votes |

## Security note

Room-based voting means anyone who knows a room number can vote for it. The
automated flagging is the main defense — treat results as event-managed, and
consider tightening access for reuse.