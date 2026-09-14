# Lekcja 04 — przed krokiem 5

Branch: `lesson-04-before-step-5`. Baza: punkt `after-lesson-03`. Materiały wejściowe są w docelowych ścieżkach repozytorium.

## Uruchomienie

Otwórz repozytorium na tym branchu i wklej do agenta:

```text
Przeczytaj .agents/skills/om-backlog/SKILL.md i użyj dołączonego
.agents/skills/om-prepare-issue/SKILL.md.

Wykonaj:
om-backlog .ai/specs/product-brief.md

Obejmij całe Now / MVP z D05, wraz z Connect i wypłatami.
Zachowaj istniejące ID oraz mapowania z .ai/specs/backlog.md.
Sprawdź gotowość, wyszukaj istniejące issues i pokaż pełne drzewo,
body, kryteria akceptacji, zależności oraz propozycje adopcji.
Zaczekaj na zatwierdzenie konkretnych treści przed zapisem do trackera.
```

Skill jest instrukcją dla agenta, nie programem terminala. Nie trzeba uruchamiać aplikacji, aby przygotować backlog.

## Materiały

- [Product Brief](.ai/specs/product-brief.md) — pełny zakres, źródła, aktywne D/R/N, pytania i ocena DoR.
- [Research](.ai/specs/research/) — dostarczone materiały oraz decyzje użyte w briefie.
- [Raport aktualnego panelu](.ai/specs/research/walkthroughs/2026-09-14-paid-text-session-session-001/report.md) — dwa przebiegi po trzy role, 18 hipotez i plan ich sprawdzenia.
- [Zapis odświeżenia](.ai/specs/research/2026-09-14-brief-refresh.md) — zastosowane korekty sceptyka i granice źródeł.
- [SDLC](SDLC.md) — Definition of Ready, priorytety i ryzyko.
- [Mapa istniejących issues](.ai/specs/backlog.md) — historia tożsamości, potrzebna do deduplikacji.

To seed do planowania pełnego MVP. Q19 nadal dotyczy płatnego uruchomienia niepełnej pierwszej iteracji D13; Q20 metody badań non-bookerów, Q21 przyszłego warunku zakończenia produktu. D29 nie jest zatwierdzoną zależnością tego drzewa. Panel pozostaje SYNTHETIC i nie dowodzi popytu.

Repo ma już historyczne issues, więc skill powinien je rozpoznać i zaproponować adopcje lub aktualizacje. Sam branch nie tworzy osobnego trackera. Nie należy usuwać mapy ani istniejących issues, aby uzyskać efekt tworzenia wszystkiego od zera.

Dołączone cztery skille pochodzą z przygotowanego seeda kolekcji `open-mercato/skills`, branch `feat/pre-intake-skills`, commit bazowy `bb4dfbe`. Pozostały kod aplikacji odpowiada bazie po lekcji 3. Lokalne wyniki prób, archiwa ZIP i run logi nie są częścią tego brancha.
