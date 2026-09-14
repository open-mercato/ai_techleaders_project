# Session API transcript — checkpoint 2 (2026-09-14, production build against a throwaway PostgreSQL)

Personas are the seeded mock ones; fixtures come from 'npm run db:seed:sessions'.
Booking ids: open=ae852ecb-7721-41e5-bae8-0d0786e99af8 ended=29f2bc6b-06ae-41a9-ac86-9942a5b583e8 not-started=4b010268-54ee-40fa-8175-095695e0a90c

## GET /api/sessions/{id} — no session
HTTP 401

## GET /api/sessions/{open} — as the mentee
{
    "ok": true,
    "data": {
        "bookingId": "ae852ecb-7721-41e5-bae8-0d0786e99af8",
        "viewerUserId": "5a82e669-25eb-4738-87c2-f7f25cb7b2f0",
        "counterpartName": "Mock Mentor",
        "lengthMinutes": 50,
        "window": {
            "state": "open",
            "startsAt": "2026-09-14T09:18:05.152Z",
            "endsAt": "2026-09-14T10:08:05.152Z"
        },
        "messages": [
            {
                "id": "9d0f600b-f03f-41eb-9ba0-8ada922e6672",
                "authorId": "5a82e669-25eb-4738-87c2-f7f25cb7b2f0",
                "authorName": "Mock Mentee",
                "body": "My API result has optional data and error fields, and every caller checks both. Where should I start?",
                "createdAt": "2026-09-14T09:19:05.152Z"
            },
            {
                "id": "e01304d0-d38a-428e-95a2-336cafdff2ee",
                "authorId": "33f7ae21-2e7b-4d3f-85aa-097724bbed76",
                "authorName": "Mock Mentor",
                "body": "Make success and failure separate cases first. Can you paste the current type?",
                "createdAt": "2026-09-14T09:20:05.152Z"
            },
            {
                "id": "5efdd4f0-873b-43a3-8cb1-22bd7eb546b6",
                "authorId": "5a82e669-25eb-4738-87c2-f7f25cb7b2f0",
                "authorName": "Mock Mentee",
                "body": "Does this land in the transcript?",
                "createdAt": "2026-09-14T09:31:05.490Z"
            },
            {
                "id": "73e5b3a2-a9a7-45b5-87a7-c5c35f23d194",
                "authorId": "33f7ae21-2e7b-4d3f-85aa-097724bbed76",
                "authorName": "Mock Mentor",
                "body": "Yes, I can see it.",
                "createdAt": "2026-09-14T09:31:16.788Z"
            }
        ],
        "maxMessageLength": 4000
    }
}

## GET /api/sessions/{open} — as the mentor (counterpart flips, same transcript)
{
  "counterpartName": "Mock Mentee",
  "viewerUserId": "33f7ae21-2e7b-4d3f-85aa-097724bbed76",
  "window": {
    "state": "open",
    "startsAt": "2026-09-14T09:18:05.152Z",
    "endsAt": "2026-09-14T10:08:05.152Z"
  }
}
messages: 4

## GET /api/sessions/{open} — as a third user who also holds operator
HTTP 403
{"ok":false,"error":{"code":"forbidden","message":"This session belongs to the mentee and the mentor who booked it."}}

## GET /api/sessions/{unknown} — signed in
HTTP 404
{"ok":false,"error":{"code":"not_found","message":"This session does not exist."}}

## POST .../messages — inside the window, body trimmed
{"ok":true,"data":{"id":"c2f14927-7aab-45f2-8a1c-520919e23e68","authorId":"5a82e669-25eb-4738-87c2-f7f25cb7b2f0","authorName":"Mock Mentee","body":"Trimmed on the way in.","createdAt":"2026-09-14T09:31:41.020Z"}}

## POST .../messages — before the start
HTTP 409
{"ok":false,"error":{"code":"conflict","message":"This session has not started yet."}}

## POST .../messages — after the end
HTTP 409
{"ok":false,"error":{"code":"conflict","message":"This session has ended. The mentor's written answer comes next."}}

## POST .../messages — without the CSRF header
HTTP 403

## POST .../messages — whitespace only
{"ok":false,"error":{"code":"validation_failed","message":"Validation failed","fieldErrors":{"body":["Write a message before sending it."]}}}

## POST .../messages — as the third user
{"ok":false,"error":{"code":"forbidden","message":"This session belongs to the mentee and the mentor who booked it."}}
