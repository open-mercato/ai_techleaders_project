# Data request — help requests on a developers' Discord, requested 2026-08-17, delivered 2026-09-04

- Question it answers: how often developers ask strangers for help with a specific blocker, how fast anyone replies, how often nobody does, and how often the thread ends with the problem solved. Feeds Problems (frequency, cost).
- Source system and owner: the `#help-*` channels of an English-speaking developers' Discord (about 4,000 members) where founder B is a moderator; export agreed with the other moderators.
- Filter and period: every new thread in `#help-typescript`, `#help-react`, `#help-python`, `#help-ai-agents`, `#help-node`, `#help-other` from 2026-08-18 to 2026-08-31 (14 days). Bot posts and job posts removed.
- Format and where it lands: `2026-09-04-discord-help-requests.csv` in this directory, one row per thread.
- Personal data present and how it was reduced: usernames, message text and links removed before the file left the server. Each thread is reduced to a topic label (assigned by founder B while reading), an urgency signal (the words the poster used, e.g. "release tomorrow", or blank), the minutes to the first human reply, replies in 24 hours, whether the thread ended resolved (yes / partial / no / unknown, judged from the last message), and the poster's context when they said it themselves (employed / freelance / student / unknown).

Columns: `id, posted_at, channel, stack, topic, urgency_signal, first_reply_minutes, replies_24h, resolved_by_thread, asker_context`.

What the file shows, counted by founder B on 2026-09-04 (the numbers are in the file, this is a reading aid):

- 109 threads in 14 days, about 8 a day; evenings 17:00 to 21:00 are the busiest hours.
- 23 threads (21%) never got a human reply. Of the 86 answered, the median wait for the first reply was 68 minutes; 31 got a reply within 30 minutes.
- 31 threads (28%) carried an urgency signal ("release tomorrow", "prod is down", "client waiting", "demo in 2h"); 9 of those got no reply at all.
- 35 threads (32%) ended with the poster saying it was solved; 23 partially; the rest unresolved or unknown.
- By stack: python 28, typescript 23, ai-agents 18, react 16, other (kubernetes, ci, docker, db) 13, node 11.
- Poster context, when stated: employed 37, freelance 21, student 10; 41 unknown.

Limits: one community, two weeks, topic and resolution labels assigned by one person. "Resolved" means the poster said so in the thread, nothing more. Nothing here says whether anyone would pay.
