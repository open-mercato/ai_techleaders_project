# Przejście narracyjne: płatna sesja tekstowa, 2026-09-14

[SYNTHETIC]

Panel pozostawia 18 powtórzonych hipotez do sprawdzenia z ludźmi. Najbardziej bezpośredni test dotyczy rozumienia zapłaty przy nieobecności oraz dopasowania pytania do mentora przed zobowiązaniem. To wynik symulacji, który nie spełnia Definition of Ready i nie ustala popytu.

- Stance: adversary.
- Panel: 2 przebiegi × 3 persony; P01/P02/P03 oraz P04/P05/P06.
- Podstawa: trzy dostarczone, redagowane zapisy `[INTERVIEW]`; pięć etapów opisanej propozycji `[DOCUMENT]`; nowe scenariusze i proporcje ról `[ASSUMPTION]`. Nie dodano nowego badania ludzi. Szczegóły: [proweniencja](../../2026-09-14-source-provenance.md).
- Migawka: [personas.md](personas.md). Przedmiot: [inputs/subject.md](inputs/subject.md). Protokół: [inputs/protocol.md](inputs/protocol.md). Metadane: [session.json](inputs/session.json).
- Nasycenie: nieosiągnięte; 3 nowych tematów na 28 zakodowanych wystąpień w ostatnich trzech wywiadach. Liczymy materiał tej sesji, nie populację.
- Parity: jakościowe porównanie z dwoma odłożonymi dostarczonymi zapisami; 9 z 15 znormalizowanych tematów ma odpowiednik. Nie jest to zgodność z nowym testem ludzi ani niezależnie potwierdzonymi transkryptami.
- Czas: metadane podają start 2026-09-14T10:04:54.170871+00:00. Czas budowy person, wywiadów, przejścia, konsolidacji i porównania nie był osobno mierzony; brak podstaw do podania minut.
- Poza możliwościami panelu: wielkość rynku/proporcje A05/A07, prawdziwość pochodzenia danych, dostępność i konwersja mentorów A03, faktyczne płatności A02 i zakup subskrypcji A01. Role mentorskie nie odpowiadają za przeszłe zakupy pomocy przez mentee.

## Zakres i ograniczenia

To pięcioetapowy spacer po opisie: oferta mentora, wybór, rezerwacja/płatność, tekstowa sesja, notatka/wypłata. Nie otwierano przeglądarki i nie oceniano ekranów ani działającego oprogramowania. Każda persona zaznaczyła etapy innej roli jako niedotyczące, zamiast stawać się operatorem lub drugą stroną transakcji.

Przebieg drugi ma świeże instancje i osobne konteksty, lecz powtarza te same trzy pojedyncze źródła. Powtarzalność opisuje stabilność wygenerowanych obiekcji przy zmianie scenariusza. Nie oznacza replikacji na sześciu niezależnych osobach. Podział 1+1+1 jest celowy i założony; Discord nie daje rozkładu łącznego rynku mentorów i mentee. Obojętni P03/P06 pozostali w panelu.

Przedmiot był częściowo nieaktualny: nazywał kanał sesji oczekującym decyzji oraz kolejność Connect nierozstrzygniętą. Aktualne dokumenty już wskazują sesję w aplikacji (D27) i Connect w pełnym MVP (D04/D05). Transkryptów nie poprawiano po fakcie. Z tych zdań nie wyprowadzamy bieżącego blokera decyzyjnego. Zachowujemy tylko ryzyka użycia tekstu i reakcji na wymagania onboardingu. To samo dotyczy brakujących szczegółów no-show czy zakresu: są brakami tej narracji, nie automatycznie błędami istniejącego kodu lub kompletnych specyfikacji.

## Kodowanie i powtarzalność

Temat to jeden problem lub zachowanie, zakodowany raz na personę. Słownik T01–T23 znormalizowano wspólnie po odczytaniu wszystkich sześciu wyników. Równoważne nazwy z JSON połączono; osobne skutki pozostały oddzielne. Dwa tematy z jednej odpowiedzi są możliwe tylko tam, gdzie dotyczy ona odrębnie odbiorcy/pytania lub wysiłku/wartości notatki. Uzupełnienia z Markdown i decyzji są wyliczone niżej. Nie liczymy kilkukrotnego powtórzenia tego samego tematu przez jedną personę.

Waga = liczba instancji podnoszących temat. Rozrzut = bezwzględna różnica liczby między przebiegami, zapisana jako ±s zgodnie ze szablonem. Powtórzony wynik wymaga obecności w obu przebiegach. Wagi nie są udziałem użytkowników, przewidywaniem konwersji ani priorytetem backlogu.

Nie tworzymy ścisłej kolejności z tych małych różnic. Wszystkie pary o tej samej wadze są remisami; także sąsiednie wagi 6/5, 5/4, 4/3 i 3/2 mieszczą się w większym rozrzucie ich wyników. Tabela jest uporządkowana liczbą wystąpień dla audytu, bez narzucania kolejności wdrażania.

| Temat | Instancje | Przebieg 1 | Przebieg 2 | Waga | Rozrzut | Klasyfikacja |
|---|---|---:|---:|---:|---:|---|
| T06: Praca przy zatwierdzaniu i poprawianiu notatki | P01, P02, P03, P04, P05, P06 | 3 | 3 | 6 | ±0 | powtórzony |
| T05: Nieobecność i pieniądze | P01, P02, P04, P05, P06 | 2 | 3 | 5 | ±1 | powtórzony |
| T02: Dorobek właściwy dla konkretnego problemu | P01, P03, P04, P06 | 2 | 2 | 4 | ±0 | powtórzony |
| T16: Oczekiwanie a długość sesji | P01, P03, P04, P06 | 2 | 2 | 4 | ±0 | powtórzony |
| T04: Okno anulowania krótsze od wyprzedzenia rezerwacji | P01, P03, P06 | 2 | 1 | 3 | ±1 | powtórzony |
| T19: Materiał możliwy do udostępnienia | P01, P04, P06 | 1 | 2 | 3 | ±1 | powtórzony |
| T03: Cena przed zaangażowaniem | P01, P04 | 1 | 1 | 2 | ±0 | powtórzony |
| T07: Obciążenie konfiguracją oferty | P02, P05 | 1 | 1 | 2 | ±0 | powtórzony |
| T08: Publikacja terminu wymaga rzeczywistej dostępności i ceny | P02, P05 | 1 | 1 | 2 | ±0 | powtórzony |
| T09: Kontrola nad odbiorcą | P02, P05 | 1 | 1 | 2 | ±0 | powtórzony |
| T10: Pytanie przed zobowiązaniem mentora | P02, P05 | 1 | 1 | 2 | ±0 | powtórzony |
| T11: Własne odpowiedzi a prywatna notatka z sesji | P02, P05 | 1 | 1 | 2 | ±0 | powtórzony |
| T13: Dane do wypłaty przed pierwszą rezerwacją | P02, P05 | 1 | 1 | 2 | ±0 | powtórzony |
| T14: Rozwiązanie samemu lub wewnątrz firmy | P03, P06 | 1 | 1 | 2 | ±0 | powtórzony |
| T15: Kto ponosi wydatek | P03, P06 | 1 | 1 | 2 | ±0 | powtórzony |
| T17: Mała wartość dodatkowego archiwum | P03, P06 | 1 | 1 | 2 | ±0 | powtórzony |
| T21: Przychód jako powód wyjścia z DM | P02, P05 | 1 | 1 | 2 | ±0 | powtórzony |
| T22: Zakres przed płatnością mentee | P01, P06 | 1 | 1 | 2 | ±0 | powtórzony |
| T01: Rozmowa przy wycenie | P01 | 1 | 0 | 1 | ±1 | Seen once |
| T12: Autorstwo i kontrola tekstu | P02 | 1 | 0 | 1 | ±1 | Seen once |
| T18: Przeniesienie deklarowanego budżetu na inny problem | P04 | 0 | 1 | 1 | ±1 | Seen once |
| T20: Tekst przy błędzie | P04 | 0 | 1 | 1 | ±1 | Seen once |
| T23: Tekst nie zawsze jest najszybszym kanałem | P06 | 0 | 1 | 1 | ±1 | Seen once |

## Hipotezy powtórzone w obu przebiegach

### H01 / T06: Praca przy zatwierdzaniu i poprawianiu notatki

[SYNTHETIC]

Redakcja, pełna akceptacja lub odesłanie notatki mogą przedłużyć domknięcie sesji; potrzebna byłaby czytelna obsługa braku odpowiedzi lub kolejnej wersji.

Typ: bariera. Waga 6; rozrzut ±0; przebiegi 3/3; persony P01, P02, P03, P04, P05, P06. Zależności: A06; R12/D20. Ślad: [P01](transcripts/run-1-P01.json) (note_revision_dependency); [P02](transcripts/run-1-P02.md) (uzupełnienie MD/decisions); [P03](transcripts/run-1-P03.md) (uzupełnienie MD/decisions); [P04](transcripts/run-2-P04.json) (note_approval_effort); [P05](transcripts/run-2-P05.md) (uzupełnienie MD/decisions); [P06](transcripts/run-2-P06.json) (archive_review_burden). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: mentor i mentee po konsultacji. Przejdź od szkicu z błędem do użytecznej notatki. Obserwuj poprawkę, brak odpowiedzi i to, kto uważa sesję za zakończoną.

### H02 / T05: Nieobecność i pieniądze

[SYNTHETIC]

Brak rozróżnienia nieobecności od sporu o jakość mógłby zatrzymać płatność mentee albo zobowiązanie mentora. Obie strony potrzebowałyby wiedzieć, co dzieje się z opłatą.

Typ: brak. Waga 5; rozrzut ±1; przebiegi 2/3; persony P01, P02, P04, P05, P06. Zależności: A02, A03; R09/R10. Ślad: [P01](transcripts/run-1-P01.json) (no_show_settlement_unknown); [P02](transcripts/run-1-P02.json) (no_show_income_unclear); [P04](transcripts/run-2-P04.json) (no_show_settlement_gap); [P05](transcripts/run-2-P05.json) (no_show_payment_expectation); [P06](transcripts/run-2-P06.md) (uzupełnienie MD/decisions). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: mentee i mentor po rzeczywistym no-show. Opowiedz o ostatniej nieobecności. Co otrzymała każda strona i kiedy? Następnie sprawdź rozumienie projektowanych zasad dla obu nieobecności.

### H03 / T02: Dorobek właściwy dla konkretnego problemu

[SYNTHETIC]

Sam stack i świeża dostępność mogą nie wystarczyć do wyboru osoby; uczestnik potrzebowałby przykładu podobnej pracy.

Typ: bariera. Waga 4; rozrzut ±0; przebiegi 2/2; persony P01, P03, P04, P06. Zależności: A02, A07; R13/N02. Ślad: [P01](transcripts/run-1-P01.json) (public_work_relevance); [P03](transcripts/run-1-P03.json) (find_relevant_public_work_quickly); [P04](transcripts/run-2-P04.json) (public_work_relevance); [P06](transcripts/run-2-P06.json) (brief_search_window). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: developer z konkretnym blockerem. Znajdź osobę do ostatniego problemu i wskaż pracę, która dowodzi dopasowania. Obserwuj co porównuje i gdzie nie potrafi wybrać.

### H04 / T16: Oczekiwanie a długość sesji

[SYNTHETIC]

25/50 minut rozmowy może zostać pomylone z czasem uzyskania pomocy, mimo najwcześniejszego startu za dwie godziny. Źródłowe „do godziny” nie rozstrzyga, czy obejmuje oczekiwanie.

Typ: sprzecznosc. Waga 4; rozrzut ±0; przebiegi 2/2; persony P01, P03, P04, P06. Zależności: A04, A02; D22/R14. Ślad: [P01](transcripts/run-1-P01.md) (uzupełnienie MD/decisions); [P03](transcripts/run-1-P03.json) (wait_is_separate_from_session_length); [P04](transcripts/run-2-P04.json) (scheduled_help_delay); [P06](transcripts/run-2-P06.json) (wait_duration_ambiguity). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: developer z pilnym oraz zaplanowanym problemem. Pokaż konkretny problem i najpóźniejszy użyteczny termin odpowiedzi. Następnie odczytaj z oferty czas rozpoczęcia i trwania; nie sugeruj SLA.

### H05 / T04: Okno anulowania krótsze od wyprzedzenia rezerwacji

[SYNTHETIC]

Przy rezerwacji na czas bliższy niż 24 godziny uczestnik może od początku nie mieć bezpłatnego anulowania i nie zrozumieć tej konsekwencji.

Typ: brak. Waga 3; rozrzut ±1; przebiegi 2/1; persony P01, P03, P06. Zależności: A02, A04; R09/R14. Ślad: [P01](transcripts/run-1-P01.json) (same_day_cancellation_exposure); [P03](transcripts/run-1-P03.md) (uzupełnienie MD/decisions); [P06](transcripts/run-2-P06.md) (uzupełnienie MD/decisions). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: mentee rezerwujący na ten sam dzień. Wskaż termin bliższy niż 24 godziny, a następnie wyjaśnij konsekwencję anulowania. Sprawdź rozumienie przed płatnością.

### H06 / T19: Materiał możliwy do udostępnienia

[SYNTHETIC]

Samo przypomnienie o prawie do materiału może pozostawić uczestnika bez bezpiecznego przykładu do pracy. Panel nie zna uprawnień żadnego rzeczywistego klienta.

Typ: brak. Waga 3; rozrzut ±1; przebiegi 1/2; persony P01, P04, P06. Zależności: A02; D26/R19. Ślad: [P01](transcripts/run-1-P01.md) (uzupełnienie MD/decisions); [P04](transcripts/run-2-P04.json) (permitted_bug_material); [P06](transcripts/run-2-P06.md) (uzupełnienie MD/decisions). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: developer przynoszący problem z pracy lub zlecenia. Przygotuj przykład problemu, który wolno przekazać osobie zewnętrznej. Jak zdecydowałeś, co usunąć? Nie zbieraj tajnego kodu.

### H07 / T03: Cena przed zaangażowaniem

[SYNTHETIC]

Brak widocznej ceny w wariancie symulacji zatrzymałby ocenę oferty. Aktualny opis już podaje cenę, więc jest to warunek do sprawdzenia w interfejsie, nie wykryty brak produktu.

Typ: bariera. Waga 2; rozrzut ±0; przebiegi 1/1; persony P01, P04. Zależności: A02; R08, D28. Ślad: [P01](transcripts/run-1-P01.json) (price_before_commitment); [P04](transcripts/run-2-P04.md) (uzupełnienie MD/decisions). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: freelancer kupujący konsultację. Odczytaj kwotę za wybraną długość przed opisaniem problemu i logowaniem. Sprawdź, czy poprawnie rozumie cenę całkowitą.

### H08 / T07: Obciążenie konfiguracją oferty

[SYNTHETIC]

Dłuższe przygotowanie oferty mogłoby skłonić mentora do pozostania przy DM. Źródłowe 20 minut jest deklarowanym warunkiem, nie zmierzonym limitem użyteczności.

Typ: bariera. Waga 2; rozrzut ±0; przebiegi 1/1; persony P02, P05. Zależności: A03; D18. Ślad: [P02](transcripts/run-1-P02.json) (setup_effort_ceiling); [P05](transcripts/run-2-P05.json) (bounded_profile_setup). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: zaproszony mentor przygotowujący pierwszą ofertę. Przygotuj ofertę z rzeczywistym opisem, cenami i terminem. Zmierz wysiłek oraz zanotuj miejsca przerwania; nie narzucaj fikcyjnego czasu.

### H09 / T08: Publikacja terminu wymaga rzeczywistej dostępności i ceny

[SYNTHETIC]

Samo zaproszenie do publikacji terminu nie wystarczyłoby do uznania mentora za aktywnego, gdy nie ustalił czasu, stawki i formalnej możliwości pomocy.

Typ: brak. Waga 2; rozrzut ±0; przebiegi 1/1; persony P02, P05. Zależności: A03; D18/R17. Ślad: [P02](transcripts/run-1-P02.json) (unconfirmed_mentor_capacity); [P05](transcripts/run-2-P05.json) (unproven_supply_and_rate). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: mentor z pierwszej partii zaproszeń. Otwórz własny kalendarz i przygotuj bookowalny termin oraz cenę. Odróżnij deklarację od opublikowanej oferty; użyj rzeczywistego pomiaru D18.

### H10 / T09: Kontrola nad odbiorcą

[SYNTHETIC]

Mentor ceniący znaną społeczność może obawiać się rezerwacji od nieznanej osoby; sam share link nie gwarantuje znajomości odbiorcy.

Typ: bariera. Waga 2; rozrzut ±0; przebiegi 1/1; persony P02, P05. Zależności: A03; D21/R13. Ślad: [P02](transcripts/run-1-P02.json) (known_audience_preference); [P05](transcripts/run-2-P05.json) (known_requester_before_commitment). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: mentor zapraszający własną publiczność. Jak wybierałeś osoby, którym pomogłeś ostatnio? Przejdź przez rezerwację od znanej i nieznanej osoby i wskaż granice pomocy.

### H11 / T10: Pytanie przed zobowiązaniem mentora

[SYNTHETIC]

Bez wcześniejszego wglądu w pytanie mentor może przyjąć temat poza kompetencjami lub pracę domową, której nie chce wykonywać.

Typ: brak. Waga 2; rozrzut ±0; przebiegi 1/1; persony P02, P05. Zależności: A03; D05, R13. Ślad: [P02](transcripts/run-1-P02.json) (question_before_commitment); [P05](transcripts/run-2-P05.json) (known_requester_before_commitment). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: mentor selekcjonujący konsultacje. Pokaż ostatnie pytanie, które odrzuciłeś. Jakiej informacji potrzebujesz przed przyjęciem konkretnej rezerwacji?

### H12 / T11: Własne odpowiedzi a prywatna notatka z sesji

[SYNTHETIC]

Mentor może oceniać ofertę przez możliwość korzystania z własnego zbioru odpowiedzi. Prywatna notatka nie realizuje całej oczekiwanej wartości tego zbioru; nie oznacza to zgody na włączenie vaulta do Now.

Typ: sprzecznosc. Waga 2; rozrzut ±0; przebiegi 1/1; persony P02, P05. Zależności: A03, A01; D05/D20. Ślad: [P02](transcripts/run-1-P02.json) (reuse_of_private_answers); [P05](transcripts/run-2-P05.json) (private_answer_document_value). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: mentor używający własnego zbioru odpowiedzi. Pokaż jak użyłeś własnego dokumentu przy ostatniej pomocy. Co z tego procesu da się wykonać w sesji i co musiałoby zostać poza produktem?

### H13 / T13: Dane do wypłaty przed pierwszą rezerwacją

[SYNTHETIC]

Wariant wymagający danych bankowych przed pierwszym klientem wywołałby opór w obu instancjach tego samego mentora. To ryzyko UX obowiązkowej ścieżki Connect, nie dowód, że Connect jest poza MVP albo że sekwencja produktu nadal nie została wybrana.

Typ: bariera. Waga 2; rozrzut ±0; przebiegi 1/1; persony P02, P05. Zależności: A03; D04/R05. Ślad: [P02](transcripts/run-1-P02.json) (payout_setup_sequence); [P05](transcripts/run-2-P05.json) (bank_details_after_first_booking). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: mentor przechodzący rzeczywisty onboarding Connect. Przejdź krok wymagający danych do wypłaty. Co musisz wcześniej wiedzieć o kliencie, przychodzie i wykorzystaniu danych, żeby kontynuować?

### H14 / T14: Rozwiązanie samemu lub wewnątrz firmy

[SYNTHETIC]

Przy małej istotności problemu wewnętrzna pomoc lub własna praca mogą wygrać z zakupem; usunięcie prywatnego kosztu nie tworzy automatycznie potrzeby.

Typ: bariera. Waga 2; rozrzut ±0; przebiegi 1/1; persony P03, P06. Zależności: A02, A07; D24. Ślad: [P03](transcripts/run-1-P03.json) (low_urgency_self_resolution); [P06](transcripts/run-2-P06.md) (uzupełnienie MD/decisions). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: developer z niepilnym problemem i wewnętrznym wsparciem. Opowiedz o ostatnim problemie rozwiązanym bez zewnętrznego eksperta. Co zdecydowało o pozostaniu przy tej drodze?

### H15 / T15: Kto ponosi wydatek

[SYNTHETIC]

Developer niepłacący prywatnie za pracę może przerwać zakup, jeżeli nie potrafi przeprowadzić go po stronie firmy. Nie znamy rzeczywistej polityki zakupowej tego segmentu.

Typ: brak. Waga 2; rozrzut ±0; przebiegi 1/1; persony P03, P06. Zależności: A02; D05. Ślad: [P03](transcripts/run-1-P03.json) (company_payment_responsibility); [P06](transcripts/run-2-P06.json) (company_payment_condition). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: developer kupujący pomoc dla pracodawcy. Odtwórz ostatni niewielki zakup wiedzy lub narzędzia dla firmy. Kto płacił, kto zatwierdził i jaki dokument był potrzebny?

### H16 / T17: Mała wartość dodatkowego archiwum

[SYNTHETIC]

Developer prowadzący własny zapis może nie widzieć wartości w dodatkowej notatce platformy, nawet gdy docenia samą konsultację.

Typ: bariera. Waga 2; rozrzut ±0; przebiegi 1/1; persony P03, P06. Zależności: A06; D20. Ślad: [P03](transcripts/run-1-P03.json) (low_value_of_retained_note); [P06](transcripts/run-2-P06.json) (archive_review_burden). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: mentee prowadzący własny runbook lub notatki. Co zachowałeś po ostatniej konsultacji i gdzie do tego wróciłeś? Porównaj rzeczywiste użycie własnego zapisu z notatką sesyjną.

### H17 / T21: Przychód jako powód wyjścia z DM

[SYNTHETIC]

Sam kalendarz może nie skłonić mentora do zmiany; możliwość przychodu uruchamia jedynie dalszą ocenę, bez dowodu migracji publiczności.

Typ: bariera. Waga 2; rozrzut ±0; przebiegi 1/1; persony P02, P05. Zależności: A03; D18/D11. Ślad: [P02](transcripts/run-1-P02.md) (uzupełnienie MD/decisions); [P05](transcripts/run-2-P05.json) (income_reason_to_leave_dm). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: mentor pomagający dotąd bezpłatnie. Pokaż ostatni przypadek przekierowania pytającego do płatnej pomocy, jeśli istniał. Co wtedy uzasadniało dodatkowy proces?

### H18 / T22: Zakres przed płatnością mentee

[SYNTHETIC]

Mentee może wstrzymać zakup, jeśli przed płatnością nie potrafi ustalić, czy zadanie mieści się w konsultacji. Czas sesji nie jest gwarancją naprawy.

Typ: brak. Waga 2; rozrzut ±0; przebiegi 1/1; persony P01, P06. Zależności: A02; D05/R09. Ślad: [P01](transcripts/run-1-P01.md) (uzupełnienie MD/decisions); [P06](transcripts/run-2-P06.json) (scope_before_payment). W transkryptach pozostają reakcja natychmiastowa, emocja i decyzja po namyśle; nie są nową wypowiedzią badanego.

Sprawdzenie: mentee z konkretnym pytaniem. Przed zapłatą opisz, jaki wynik uznajesz za możliwy w wybranym czasie. Porównaj to z rozumieniem mentora.

## Odmowy i przypadki odstające

[SYNTHETIC]

P01 odrzuciłby tekst do wyceny, choć potrzebuje pomocy; zmniejszenie czekania nie usuwa tej bariery. P04 przechodzi do buga, dla którego źródło deklaruje tekst. Nie wolno przedstawić tej zmiany scenariusza jako obalenia odmowy P01 ani jako skutecznej konsultacji.

[SYNTHETIC]

P02 może przygotować opis i zatrzymać publikację na kalendarzu lub warunkach. P05 może pozostać przy DM mimo przygotowanego profilu. Obie instancje pochodzą z tego samego mentorskiego zapisu; sprzeciw wobec danych bankowych nie jest nową obserwowaną odmową onboardingu.

[SYNTHETIC]

P03 nie kupuje pomocy przy niepilnym problemie; firma pokrywająca koszt nie tworzy potrzeby. P06 przy hipotetycznym jednorazowym zadaniu dłużej ogląda ofertę, lecz wychodzi przy prywatnej płatności lub długim szukaniu. Tego kontrastu nie uśredniamy do zamiaru zakupu.

## Seen once: nie są powtórzonymi wynikami

### T01: Rozmowa przy wycenie

[SYNTHETIC]

P01 może odrzucić tekst do wyceny mimo potrzeby konsultacji. Wystąpienie: P01; przebieg 1. Do ewentualnego sprawdzenia: freelancer wyceniający projekt; Pokaż ostatnią wycenę. Którego założenia nie udało się wyjaśnić pisemnie?

### T12: Autorstwo i kontrola tekstu

[SYNTHETIC]

P02 podnosi autorstwo i późniejsze użycie tekstu ponad samą prywatność; brak równoważnego osobnego tematu w obu przebiegach. Wystąpienie: P02; przebieg 1. Do ewentualnego sprawdzenia: mentor tworzący własne materiały; Jak określałeś granice ponownego użycia własnej odpowiedzi?

### T18: Przeniesienie deklarowanego budżetu na inny problem

[SYNTHETIC]

P04 stosuje kwotę z historycznej wyceny do nowego błędu; jest to jawne założenie i nie staje się progiem ceny dla produktu. Wystąpienie: P04; przebieg 2. Do ewentualnego sprawdzenia: freelancer; Jaka była ostatnia faktycznie zapłacona cena za porównywalną pomoc i czego dotyczyła?

### T20: Tekst przy błędzie

[SYNTHETIC]

P04 uznaje tekst za zgodny z kategorią buga, ale nie pokazuje rozwiązania konkretnego błędu ani skuteczności sesji. Wystąpienie: P04; przebieg 2. Do ewentualnego sprawdzenia: developer debugujący; Przejdź tekstową konsultację na zadaniu możliwym do udostępnienia i sprawdź faktyczny wynik.

### T23: Tekst nie zawsze jest najszybszym kanałem

[SYNTHETIC]

P06 nie zakłada, że wyłączny tekst jest zawsze najszybszy; nieznany problem nie pozwala ustalić odmowy. Historyczne D27 nadal wskazuje kanał w aplikacji. Wystąpienie: P06; przebieg 2. Do ewentualnego sprawdzenia: developer z jednorazowym zadaniem; Jakie elementy ostatniego problemu łatwo wyjaśniłeś tekstem, a które wymagały innego sposobu?

## Do sprawdzenia z rzeczywistymi uczestnikami

Liczby rekrutowanych osób nie były ustalone; nie dodajemy ich z panelu. Każdy wiersz odsyła do hipotezy opisanej i oznaczonej osobno wyżej.

| Hipoteza | Persony / przebiegi | Dotyczy | Rola | Pytanie lub zadanie |
|---|---|---|---|---|
| H01 / T06 | P01, P02, P03, P04, P05, P06 / 1 i 2 | A06; R12/D20 | mentor i mentee po konsultacji | Przejdź od szkicu z błędem do użytecznej notatki. Obserwuj poprawkę, brak odpowiedzi i to, kto uważa sesję za zakończoną. |
| H02 / T05 | P01, P02, P04, P05, P06 / 1 i 2 | A02, A03; R09/R10 | mentee i mentor po rzeczywistym no-show | Opowiedz o ostatniej nieobecności. Co otrzymała każda strona i kiedy? Następnie sprawdź rozumienie projektowanych zasad dla obu nieobecności. |
| H03 / T02 | P01, P03, P04, P06 / 1 i 2 | A02, A07; R13/N02 | developer z konkretnym blockerem | Znajdź osobę do ostatniego problemu i wskaż pracę, która dowodzi dopasowania. Obserwuj co porównuje i gdzie nie potrafi wybrać. |
| H04 / T16 | P01, P03, P04, P06 / 1 i 2 | A04, A02; D22/R14 | developer z pilnym oraz zaplanowanym problemem | Pokaż konkretny problem i najpóźniejszy użyteczny termin odpowiedzi. Następnie odczytaj z oferty czas rozpoczęcia i trwania; nie sugeruj SLA. |
| H05 / T04 | P01, P03, P06 / 1 i 2 | A02, A04; R09/R14 | mentee rezerwujący na ten sam dzień | Wskaż termin bliższy niż 24 godziny, a następnie wyjaśnij konsekwencję anulowania. Sprawdź rozumienie przed płatnością. |
| H06 / T19 | P01, P04, P06 / 1 i 2 | A02; D26/R19 | developer przynoszący problem z pracy lub zlecenia | Przygotuj przykład problemu, który wolno przekazać osobie zewnętrznej. Jak zdecydowałeś, co usunąć? Nie zbieraj tajnego kodu. |
| H07 / T03 | P01, P04 / 1 i 2 | A02; R08, D28 | freelancer kupujący konsultację | Odczytaj kwotę za wybraną długość przed opisaniem problemu i logowaniem. Sprawdź, czy poprawnie rozumie cenę całkowitą. |
| H08 / T07 | P02, P05 / 1 i 2 | A03; D18 | zaproszony mentor przygotowujący pierwszą ofertę | Przygotuj ofertę z rzeczywistym opisem, cenami i terminem. Zmierz wysiłek oraz zanotuj miejsca przerwania; nie narzucaj fikcyjnego czasu. |
| H09 / T08 | P02, P05 / 1 i 2 | A03; D18/R17 | mentor z pierwszej partii zaproszeń | Otwórz własny kalendarz i przygotuj bookowalny termin oraz cenę. Odróżnij deklarację od opublikowanej oferty; użyj rzeczywistego pomiaru D18. |
| H10 / T09 | P02, P05 / 1 i 2 | A03; D21/R13 | mentor zapraszający własną publiczność | Jak wybierałeś osoby, którym pomogłeś ostatnio? Przejdź przez rezerwację od znanej i nieznanej osoby i wskaż granice pomocy. |
| H11 / T10 | P02, P05 / 1 i 2 | A03; D05, R13 | mentor selekcjonujący konsultacje | Pokaż ostatnie pytanie, które odrzuciłeś. Jakiej informacji potrzebujesz przed przyjęciem konkretnej rezerwacji? |
| H12 / T11 | P02, P05 / 1 i 2 | A03, A01; D05/D20 | mentor używający własnego zbioru odpowiedzi | Pokaż jak użyłeś własnego dokumentu przy ostatniej pomocy. Co z tego procesu da się wykonać w sesji i co musiałoby zostać poza produktem? |
| H13 / T13 | P02, P05 / 1 i 2 | A03; D04/R05 | mentor przechodzący rzeczywisty onboarding Connect | Przejdź krok wymagający danych do wypłaty. Co musisz wcześniej wiedzieć o kliencie, przychodzie i wykorzystaniu danych, żeby kontynuować? |
| H14 / T14 | P03, P06 / 1 i 2 | A02, A07; D24 | developer z niepilnym problemem i wewnętrznym wsparciem | Opowiedz o ostatnim problemie rozwiązanym bez zewnętrznego eksperta. Co zdecydowało o pozostaniu przy tej drodze? |
| H15 / T15 | P03, P06 / 1 i 2 | A02; D05 | developer kupujący pomoc dla pracodawcy | Odtwórz ostatni niewielki zakup wiedzy lub narzędzia dla firmy. Kto płacił, kto zatwierdził i jaki dokument był potrzebny? |
| H16 / T17 | P03, P06 / 1 i 2 | A06; D20 | mentee prowadzący własny runbook lub notatki | Co zachowałeś po ostatniej konsultacji i gdzie do tego wróciłeś? Porównaj rzeczywiste użycie własnego zapisu z notatką sesyjną. |
| H17 / T21 | P02, P05 / 1 i 2 | A03; D18/D11 | mentor pomagający dotąd bezpłatnie | Pokaż ostatni przypadek przekierowania pytającego do płatnej pomocy, jeśli istniał. Co wtedy uzasadniało dodatkowy proces? |
| H18 / T22 | P01, P06 / 1 i 2 | A02; D05/R09 | mentee z konkretnym pytaniem | Przed zapłatą opisz, jaki wynik uznajesz za możliwy w wybranym czasie. Porównaj to z rozumieniem mentora. |

## Dokładny pomiar odpowiedzi tak/nie

| Persona | Tak | Nie | Brak podstaw | Podstawa interpretacji |
|---|---:|---:|---:|---|
| P01 | 0 | 0 | 4 | nowa instancja nie ma własnej historii |
| P02 | 0 | 0 | 4 | pytania o szukanie pomocy nie opisują historii roli mentorskiej |
| P03 | 1 | 2 | 1 | klasyfikacja epizodu z dostarczonego zapisu, nie nowa historia persony |
| P04 | 1 | 2 | 1 | klasyfikacja epizodu z dostarczonego zapisu, nie nowa historia persony |
| P05 | 0 | 0 | 4 | pytania o szukanie pomocy nie opisują historii roli mentorskiej |
| P06 | 1 | 2 | 1 | klasyfikacja epizodu z dostarczonego zapisu, nie nowa historia persony |

Łącznie dokładnie 24 pola: **3 tak, 6 nie, 15 brak podstaw**. Wśród 9 rozstrzygniętych pól udział tak wynosi 3/9 (33,3%); to arytmetyka kodowania, nie udział badanych ani rzetelny estymator ugodowości. `no_basis` w P06 i `no basis` połączono wyłącznie w zestawieniu; pliki źródłowe pozostają identyczne.

Cztery pytania mają identyczne brzmienie, ale realizacja skryptu jest niespójna: P01 odmawia przypisania source history nowej personie, a P03/P04/P06 klasyfikują historię źródłową w metadanych. P02/P05 nie zamieniają niepobierania opłat w niepłacenie komuś i mają osiem poprawnie nierozstrzygniętych pól. Nie było podstaw, aby wymusić planowane dwa tak/dwa nie na segment. Żadne pole z tej tabeli nie służy za głos potwierdzający hipotezę. Nie obserwujemy arytmetycznej przewagi tak; niespójność i braki uniemożliwiają mocniejszy wniosek o acquiescence.

## Nasycenie

Kolejność audytu to P01→P06, nie deklarowana kolejność zegarowa zakończeń. Wystąpienie tematu liczymy raz na personę, w kolejności JSON, następnie jawne uzupełnienia z opisu. Brak zmierzonej kolejności wypowiedzi pomiędzy równoległymi agentami.

| Instancja | Zakodowane tematy | Tematy nowe wobec wcześniejszych instancji |
|---|---:|---|
| P01 | 9 | T01, T02, T03, T04, T05, T06, T16, T22, T19 |
| P02 | 10 | T07, T08, T09, T10, T11, T12, T13, T21 |
| P03 | 7 | T14, T15, T17 |
| P04 | 8 | T20, T18 |
| P05 | 9 | 0 |
| P06 | 11 | T23 |

Okno ostatnich trzech wywiadów obejmuje 28 wystąpień, więc nie trzeba go rozszerzać do dwudziestu. Nowe są 3: T20, T18, T23. 3/28 nie jest mniejsze niż 1/20. Nasycenie nieosiągnięte. Dalsze symulacje mogłyby dodać tematy, ale świeże źródła od innych osób są ważniejsze niż kolejna wersja tych samych głosów.

## Porównanie z odłożonymi zapisami

Porównanie wykorzystuje wyłącznie [fintech, 2026-09-01](../../2026-09-01-interview-backend-dev-fintech.md) i [staff engineer, 2026-09-03](../../2026-09-03-interview-staff-engineer-declined-before.md). Kopie wejść P01–P06 nie zawierały tych notatek. Nie porównuje się tu panelu z trzema zapisami, które go zbudowały. Obie notatki pochodzą jednak z tej samej dostarczonej kolekcji; nie ustalono niezależnego doboru ani dosłowności zapisów. Skrypty historycznych rozmów różnią się od obecnego protokołu.

Znormalizowano 15 tematów z holdoutów. 9 ma odpowiednik w pełnych transkryptach panelu, 6 pozostaje wyłącznie w holdoutach. Tabela nazywa dokładny zakres zgodności; ogólnego podobieństwa nie traktuje jako odtworzenia konkretnej historii. To wynik kodowania dwóch dokumentów, bez procentu „parytetu z ludźmi”.

| Kod | Temat holdoutu | Źródło | Odpowiednik i różnica |
|---|---|---|---|
| K01 | Dowód dokładnie podobnej pracy, publiczne repo/post zamiast samego tytułu lub gwiazdek | fintech; staff | T02, profile P01/P02/P04/P05 |
| K02 | Szybkie znalezienie pomocy i użyteczny czas odpowiedzi | fintech | T02/T16; panel pozostawia znaczenie godziny niejasne |
| K03 | Kto płaci i czy wydatek mieści się w pracy | fintech | T15; w źródle fintech decyzja self/company jest wahaniem |
| K04 | Własna dokumentacja zamiast archiwum platformy | fintech | T17; holdout nazywa runbook, panel mówi ogólniej |
| K05 | Jednorazowa pomoc zamiast długiej relacji/subskrypcji | fintech; staff | profile P01/P03/P06; brak subskrypcji jest już zgodny z Now |
| K06 | Pytanie i zakres przed zobowiązaniem | staff | T10/T22 |
| K07 | Share link i kontrola tego, komu mentor pomaga | staff | T09; holdout mocniej odrzuca publiczną listę |
| K08 | Niechęć do ocen jako podstawy zaufania lub udziału | fintech; staff | profile P01/P02/P04/P05, narracja kroku 2 |
| K09 | Tekst do konkretnej pomocy technicznej | fintech; staff | T20 oraz przejścia P02/P05; nie dowodzi skuteczności |

| Kod | Tylko w holdoutach | Źródło | Co uzupełnić |
|---|---|---|---|
| K10 | Wysoka cena jako filtr powagi pytającego, a nie maksymalizacja dochodu | staff | Wywiad z mentorem o ostatnim odrzuconym pytaniu i roli ceny w selekcji. |
| K11 | Miesiąc bez rezerwacji jako powód zapomnienia o produkcie | staff | Materiał o zachowaniu mentorów po okresie bez pierwszego klienta; nie przyjmować miesiąca jako retention SLA. |
| K12 | Możliwość usunięcia już opublikowanych materiałów | staff | Pytanie o ostatnią próbę wycofania publikacji; Later, nie nowy zakres 1.0. |
| K13 | Obejrzenie wykorzystania notatek przez AI przed jego wydaniem | staff | Przy powrocie vaulta/MCP do scope zaprosić autora do obejrzenia propozycji; brak AI w Now nie odpowiada na tę późniejszą potrzebę. |
| K14 | Granica kontaktu rekrutacyjnego: nie pisać w weekend | staff | Ustalić rzeczywiste preferencje kontaktu przed zaproszeniem; bez przenoszenia na całą podaż. |
| K15 | Konkretny problem sprzętu audio po czasochłonnym znalezieniu konsultanta | fintech | Odtworzyć wcześniejszą konsultację i jej kroki niepowodzenia; panel nie miał tego doświadczenia. |

Ton pokrywa się częściowo: ostrożność, konkretna kompetencja i ograniczanie dodatkowego procesu występują w obu zbiorach. Staff engineer wyraża mocniejszą odmowę listy i zależności niż mentor panelu. Fintech podaje konkretny rollback, runbook i kłopot z mikrofonem; panel nie odtwarza tej szczegółowości. Brak drugiego holdoutu osoby obojętnej wyklucza ocenę dopasowania P03/P06 na podstawie innego takiego przypadku.

Wyłącznie panel podniósł w tym porównaniu m.in. rozliczenie no-show, natychmiastową utratę bezpłatnego anulowania, bankowe dane przed pierwszym klientem, dodatkowy wysiłek akceptacji notatki i bezpieczny przykład bez kodu firmy. Są pytaniami do rozmów, nie nowymi faktami: odpowiednio H/T05, T04, T13, T06 i T19 wskazują zadania w planie. Brak tematu w holdoucie może wynikać z braku pytania. Nie przenosi się go do person po fakcie i nie przelicza lepszego pokrycia.

## Rejestr kodowania tematów

| Persona | Surowy klucz JSON | Kod po normalizacji |
|---|---|---|
| P01 | estimate_needs_discussion | T01 |
| P01 | public_work_relevance | T02 |
| P01 | price_before_commitment | T03 |
| P01 | same_day_cancellation_exposure | T04 |
| P01 | no_show_settlement_unknown | T05 |
| P01 | note_revision_dependency | T06 |
| P02 | setup_effort_ceiling | T07 |
| P02 | unconfirmed_mentor_capacity | T08 |
| P02 | known_audience_preference | T09 |
| P02 | question_before_commitment | T10 |
| P02 | no_show_income_unclear | T05 |
| P02 | reuse_of_private_answers | T11 |
| P02 | control_over_written_material | T12 |
| P02 | payout_setup_sequence | T13 |
| P03 | low_urgency_self_resolution | T14 |
| P03 | company_payment_responsibility | T15 |
| P03 | find_relevant_public_work_quickly | T02 |
| P03 | wait_is_separate_from_session_length | T16 |
| P03 | low_value_of_retained_note | T17 |
| P03 | no_purchase_on_current_problem | T14 |
| P04 | bug_text_fit | T20 |
| P04 | public_work_relevance | T02 |
| P04 | scheduled_help_delay | T16 |
| P04 | personal_payment_limit_transfer | T18 |
| P04 | no_show_settlement_gap | T05 |
| P04 | permitted_bug_material | T19 |
| P04 | note_approval_effort | T06 |
| P05 | known_requester_before_commitment | T09,T10 |
| P05 | income_reason_to_leave_dm | T21 |
| P05 | bounded_profile_setup | T07 |
| P05 | bank_details_after_first_booking | T13 |
| P05 | no_show_payment_expectation | T05 |
| P05 | private_answer_document_value | T11 |
| P05 | unproven_supply_and_rate | T08 |
| P06 | company_payment_condition | T15 |
| P06 | brief_search_window | T02 |
| P06 | wait_duration_ambiguity | T16 |
| P06 | scope_before_payment | T22 |
| P06 | archive_review_burden | T06,T17 |
| P06 | text_speed_uncertain | T23 |

Uzupełnienia z transkryptu lub jawnej decyzji, dodane przed końcowym liczeniem:

- P01, T16: MD krok 1: brak terminu dzisiaj; krok 3: minimum dwóch godzin.
- P01, T22: MD krok 3: brak dopasowania zagadnienia przed płatnością.
- P01, T19: MD krok 4: niejasne uprawnienia do materiałów.
- P02, T06: MD krok 5: kolejna redakcja po sesji.
- P02, T21: JSON decisions: sam kalendarz zmieniony na możliwość przychodu.
- P03, T04: JSON decisions: utrata opłaty przy anulowaniu później niż 24 godziny przed.
- P03, T06: JSON decyzja domknięcia: nie akceptuje notatki bez przeczytania; MD krok 5.
- P04, T03: MD profil: cena przed pisaniem; presja kosztu nie zastępuje ceny w jawnej ofercie.
- P05, T06: MD krok 5: dodatkowe redagowanie.
- P06, T04: MD krok 3: termin bliższy niż 24 godziny bez bezpłatnego okna.
- P06, T19: MD krok 4: postępowanie bez materiałów firmowych.
- P06, T14: JSON decisions: najpierw pomoc wewnętrzna; MD wyjście do własnej pracy.
- P06, T05: MD krok 4: brak opisu nieobecności; brakujący przypadek, nie dowiedziona odmowa.

## Transkrypty i dowody

- P01, przebieg 1: [Markdown](transcripts/run-1-P01.md), [JSON](transcripts/run-1-P01.json), źródło [inputs/P01-source.md](inputs/P01-source.md).
- P02, przebieg 1: [Markdown](transcripts/run-1-P02.md), [JSON](transcripts/run-1-P02.json), źródło [inputs/P02-source.md](inputs/P02-source.md).
- P03, przebieg 1: [Markdown](transcripts/run-1-P03.md), [JSON](transcripts/run-1-P03.json), źródło [inputs/P03-source.md](inputs/P03-source.md).
- P04, przebieg 2: [Markdown](transcripts/run-2-P04.md), [JSON](transcripts/run-2-P04.json), źródło [inputs/P04-source.md](inputs/P04-source.md).
- P05, przebieg 2: [Markdown](transcripts/run-2-P05.md), [JSON](transcripts/run-2-P05.json), źródło [inputs/P05-source.md](inputs/P05-source.md).
- P06, przebieg 2: [Markdown](transcripts/run-2-P06.md), [JSON](transcripts/run-2-P06.json), źródło [inputs/P06-source.md](inputs/P06-source.md).

Każdy transkrypt zawiera pięć etapów narracji, pierwsze trzy zauważone rzeczy, odczucie, tarcie i brakujący przypadek. Nie ma screenshotów, ponieważ nie oglądano ekranów. Nie mierzyliśmy skuteczności produktu, czasów jego użycia ani zachowania ludzi. Kopie transkryptów pozostają bez poprawek; raport koryguje interpretację i odsyła do [kontroli jakości](quality-gate.md).

Personas: .ai/specs/research/personas.md
Walkthrough: .ai/specs/research/walkthroughs/2026-09-14-paid-text-session-session-001/report.md
Runs: 2 runs × 3 personas; 18 findings survived every run; saturation not reached
Parity: 9 of 15 themes in two held-out supplied edited records; qualitative comparison, not independently verified human parity
Hypotheses: 18 to confirm with real users
Next: om-discover --refresh
