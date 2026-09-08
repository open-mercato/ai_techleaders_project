# Interview — backend developer, fintech, 2026-09-01, ~25 min, phone, raw notes by founder A (transcript in Polish, summary in English)

Znajomy znajomego. 8 lat, Python i Go, ma on-call. Dzwonił z samochodu, chwilami go nie było. Na dzień dobry: „mam 20 minut, potem odbieram młodego".

Ja: kiedy ostatnio utknąłeś i nie miałeś kogo zapytać
On: w sensie w pracy?
Ja: no
On: ... czekaj. dwa tygodnie temu? nie, trzy. piątek. helm, upgrade, ingress na stagingu padł. a w poniedziałek release
Ja: i co
On: no i nic, googlałem. z godzinę. znalazłem trzy issue na githubie, wszystkie zamknięte, works for me. normalnie
Ja: pytałeś kogoś
On: na slacku, ale piątek osiemnasta, kto tam jest. platformowiec na weselu był
Ja: a poza firmą
On: wrzuciłem na discorda, kubernetesowego. ktoś odpisał w sobotę
Ja: i?
On: i źle
(coś z nawigacją, „skręć w lewo", przerwa)
Ja: to jak się skończyło
On: rollback. napisałem leadce że wtorek. no. nie była zachwycona
Ja: a gdybyś w ten piątek mógł komuś zapłacić, kto to zna
On: (śmiech) w piątek o szóstej? jasne. tylko żebym go miał w dwadzieścia minut. nie że zakładam konto, weryfikacja maila, potem czekam
Ja: ile byś dał
On: nie wiem. pięćdziesiąt euro? sto jak naprawdę naprawi
Ja: z własnej kieszeni?
On: wrzuciłbym na firmę... a nie, nie chciałoby mi się tłumaczyć. sam bym zapłacił. chyba
Ja: płaciłeś kiedyś komuś za pomoc
On: raz. codementor, ze dwa lata temu. gość był ok. tylko szukałem go czterdzieści minut, a potem chciał calla i mi mikrofon nie działał
Ja: i?
On: i tyle, przeszło mi. nie przez niego
Ja: wolisz tekst
On: tekst. wkleję yamla. call jak tekst nie zadziała
Ja: a skąd byś wiedział, że obcy gość to zna
On: że robił to samo. nie „senior engineer" tylko „robiłem upgrade ingress-nginx na 1.28". github wystarczy
Ja: gwiazdki, oceny
On: eee. każdy ma pięć gwiazdek
Ja: a potem, chciałbyś mieć tę odpowiedź gdzieś zapisaną, na stronie
On: po co. wkleję do runbooka
Ja: coś, czego nie potrzebujesz, a nam by się wydawało, że tak
On: subskrypcja. community. ścieżka nauki. nie chcę się uczyć helma, chcę żeby ingress wstał
On: aha, i jak booking trwa więcej niż pięć minut to robię rollback i idę do domu
Ja: ok, ostatnie
On: sorry, jestem pod przedszkolem

Nie zdążyłam: jak często to się dzieje (jeden piątek, nie wiem czy wzorzec), czy firma ma na to budżet, co z wklejaniem yamla z produkcji obcemu. Trzy tygodnie czy dwa, poprawiał się w trakcie.

---

- Situation: Helm upgrade broke staging ingress on a Friday evening, release on Monday, platform engineer at a wedding.
- What they did: an hour of search, closed GitHub issues, internal Slack with nobody on, a Kubernetes Discord post answered wrong on Saturday, rollback, release slipped to Tuesday.
- Cost: the slip, the lead "nie była zachwycona", the evening.
- Tried before: Codementor once, two years ago, 40 minutes to find someone, then a call that failed on a mic; would not go back, "nie przez niego".
- Problem gone when: someone who has done exactly this upgrade replies within twenty minutes, over text, with the yaml in front of them.
- Quotes: "w piątek o szóstej? jasne"; "nie senior engineer tylko robiłem upgrade ingress-nginx na 1.28"; "każdy ma pięć gwiazdek"; "jak booking trwa więcej niż pięć minut to robię rollback i idę do domu".
- Did not care about: ratings, saved answers on a site, subscription, community, learning path.
- Interviewer's remarks: price was a shrug, not a number; "na firmę / sam" unresolved, ended on "chyba". Frequency unknown; one Friday told as if it were the norm. Call cut short at the kindergarten.
