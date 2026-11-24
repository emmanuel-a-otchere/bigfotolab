<div align="center">
  <img src="../docs/public/icon.png" alt="Logo bigfotolab" width="120" style="border-radius: 20px">
  <h1>bigfotolab — prywatny, lokalny menedżer zdjęć</h1>
  <h3>Darmowy menedżer zdjęć na komputery stacjonarne o otwartym kodzie źródłowym, dla systemów macOS, Windows i Linux.</h3>
  <p>
    <a href="https://trendshift.io/repositories/24497?utm_source=repository-badge&amp;utm_medium=badge&amp;utm_campaign=badge-repository-24497" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/repositories/24497" alt="bigfotolab | Trendshift" width="250" height="55"/></a>
  </p>
  <p>
    <a href="https://github.com/emmanuel-a-otchere/bigfotolab/releases"><img src="https://img.shields.io/github/v/release/emmanuel-a-otchere/bigfotolab" alt="Wydanie GitHub"></a>
    <a href="https://github.com/emmanuel-a-otchere/bigfotolab/releases"><img src="https://img.shields.io/github/downloads/emmanuel-a-otchere/bigfotolab/total" alt="Wszystkie wydania GitHub"></a>
    <a href="https://github.com/emmanuel-a-otchere/bigfotolab/stargazers"><img src="https://img.shields.io/github/stars/emmanuel-a-otchere/bigfotolab" alt="Gwiazdki GitHub"></a>
  </p>
</div>

[English](../README.md) | [Česky](README.cs.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md) | [Italiano](README.it.md) | [Magyar](README.hu.md) | [Nederlands](README.nl.md) | Polski | [Português](README.pt.md) | [Русский](README.ru.md) | [Українська](README.uk.md) | [Tiếng Việt](README.vi.md) | [中文简体](README.zh-CN.md) | [中文繁體](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

bigfotolab to bezpłatny, otwarty menedżer zdjęć działający lokalnie na macOS, Windows i Linux. Organizuj istniejące foldery, wyszukuj za pomocą lokalnej AI i zarządzaj dużymi bibliotekami bez konta w chmurze ani subskrypcji.

<div align="center">
  <p><strong><a href="https://emmanuel-a-otchere.github.io/bigfotolab/">OFICJALNA STRONA</a> | <a href="https://emmanuel-a-otchere.github.io/bigfotolab/demos/bigfotolab/index.html">DEMO</a></strong></p>
</div>

## Pobierz bigfotolab

Otwórz [stronę najnowszego wydania](https://github.com/emmanuel-a-otchere/bigfotolab/releases/latest) i pobierz plik pasujący do Twojego systemu:

| Platforma | Pakiet | Uwaga |
| :-- | :-- | :-- |
| **macOS (Apple Silicon / Intel)** | `_aarch64.dmg` / `_x64.dmg` | Notaryzowany przez Apple |
| **Windows 10/11 (x64 / ARM64)** | `_x64_en-US.msi` / `_arm64_en-US.msi` | Niepodpisany. W przeglądarce wybierz **Zachowaj mimo to** lub w SmartScreen **Więcej informacji** → **Uruchom mimo to**. |
| **Linux (x64 / ARM64)** | `_amd64.deb` / `_arm64.deb` | Dla dystrybucji opartych na Debianie (Ubuntu, Debian, Linux Mint itp.) |
| **Linux (x64 / ARM64)** | `_amd64.AppImage` / `_aarch64.AppImage` | Nadaj plikowi uprawnienie do wykonywania, a następnie uruchom go dwuklikiem |

### macOS z Homebrew

```bash
brew install --cask lap
```

Instalacja przez tap `julyx10/lap`? Zobacz [instrukcję migracji](https://github.com/emmanuel-a-otchere/bigfotolab/discussions/567).

## Zrzuty ekranu

<p align="center">
  <img src="../docs/public/screenshots/lap_library.png" alt="bigfotolab — lokalny menedżer biblioteki zdjęć" width="900">
  <img src="../docs/public/screenshots/lap_map_view.png" alt="Widok mapy w bigfotolab" width="900">
  <img src="../docs/public/screenshots/lap_preview.png" alt="Podgląd zdjęcia w bigfotolab" width="900">
</p>

## Dlaczego bigfotolab

- **Prywatna AI na urządzeniu.** Opisz zdjęcie, znajdź podobne ujęcia lub przeglądaj według twarzy. Wszystko jest przetwarzane lokalnie.
- **Twoje foldery pod Twoją kontrolą.** Otwieraj istniejące foldery bezpośrednio w bigfotolab. Pliki zachowują lokalizację i format.
- **Metadane działające między aplikacjami.** bigfotolab odczytuje osadzone dane EXIF, IPTC i XMP oraz istniejące pliki sidecar XMP (oceny, tagi, ulubione, stany selekcji, GPS i daty). Zmodyfikowane metadane można zapisywać do sidecarów XMP, pozostawiając oryginalne pliki bez zmian.
- **Selekcja zdjęć.** Podgląd spacją, przejście po ocenie, pola AF, porównanie w czterech panelach i reguły zachowywania duplikatów.
- **Dla bibliotek z ponad 100 000 zdjęć i filmów.** Natywny rdzeń w Rust obsługuje przeglądanie, wyszukiwanie i skanowanie.
- **Bezpłatny i otwartoźródłowy.** Bez subskrypcji i konta, w 17 językach na macOS, Windows i Linux.

## Funkcje

- **Elastyczne przeglądanie biblioteki** według daty, folderu, lokalizacji, aparatu, obiektywu, tagów, ocen i twarzy, z sortowaniem i wyszukiwaniem.
- **Praca oparta na folderach.** Wiele bibliotek, import i eksport przez przeciąganie lub schowek, zbiorcza zmiana nazw i synchronizacja, bezpieczne przenoszenie, kopiowanie i usuwanie.
- **Lokalne wyszukiwanie AI** dla zapytań tekstowych, podobieństwa wizualnego, tematów, grupowania twarzy oraz opcjonalnego wyszukiwania wielojęzycznego w ponad 50 językach.
- **Import metadanych i zapis do XMP**: bigfotolab odczytuje osadzone dane EXIF, IPTC i XMP oraz istniejące pliki sidecar XMP (oceny, tagi, ulubione, stany selekcji, GPS i daty). Pola tekstowe można edytować, a swoją organizację zapisywać jawnie do sidecarów XMP, pozostawiając oryginalne pliki bez zmian.
- **Inteligentne albumy.** Własne grupowanie i sortowanie, filtry nazw folderów i wyszukiwalne listy wartości.
- **Import z organizacją wg dat** z układami dziennym, miesięcznym, rocznym lub jednym folderem, oryginalnymi nazwami plików i pomijaniem duplikatów.
- **Kolekcje i tagi** do masowego porządkowania wybranych plików bez przenoszenia lub duplikowania oryginałów. Drzewo tagów z przeciąganiem i licznikami gałęzi.
- **Czyszczenie duplikatów.** Reguły według folderu, formatu, rozmiaru i daty, miejsce do odzyskania i usuwanie zbiorcze.
- **Narzędzia selekcji i porównywania.** Podgląd spacją, przejście po ocenie, pola AF, porównanie w czterech panelach i reguły zachowywania duplikatów.
- **Wbudowana edycja** do kadrowania, prostowania pod dowolnym kątem, obracania, odbijania, zmiany rozmiaru i podstawowych korekt zdjęć.
- **Kolaż zdjęć** do komponowania wybranych zdjęć w kolaże: siatkę, wyrównaną mozaikę lub stos zdjęć.
- **Apple Live Photos i Google Motion Photos** z odtwarzaniem ruchu oraz ujednoliconym filtrem inteligentnych albumów.
- **Pary RAW + JPEG/HEIC** wyświetlane jako jeden element, z powiązanymi plikami utrzymywanymi razem podczas operacji na plikach. Z pary RAW można usunąć jeden plik lub oba. Gdy jeden plik zostaje, wspólny sidecar XMP pozostaje z pozostałym plikiem.
- **Konfigurowalne miniatury i podglądy RAW** przy użyciu renderowania RAW lub osadzonego podglądu z aparatu, z regulowaną jasnością i wyświetlaniem par RAW+JPEG.
- **Konfigurowalne informacje o pliku.** Wybierane pola, szczegóły na żądanie i pola AF w podglądzie.
- **Interaktywny widok mapy** do eksplorowania zdjęć i filmów z geotagami w klastrach zgodnych z bieżącymi filtrami.
- **Przeglądanie albumów offline**, dzięki któremu albumy na odłączonych lub sieciowych nośnikach pozostają widoczne wraz z buforowanymi miniaturami.
- **Pliki dostępne tylko w chmurze.** Pliki OneDrive na żądanie i pliki zastępcze macOS są indeksowane i wyświetlane bez automatycznego pobierania.
- **Jasny i ciemny motyw.** Opcjonalnie zgodny z wyglądem systemu.
- **Szeroka obsługa formatów** — ponad 60 formatów obrazów, RAW i wideo. Dokumenty Affinity (osadzony podgląd).

## Metadane i kontrola nad danymi

bigfotolab pracuje bezpośrednio z folderami i odczytuje większość wyświetlanych informacji z plików. Możesz zapisać swoją organizację w standardowych sidecarach XMP, aby podróżowała razem z plikami i pozostała czytelna dla innych aplikacji fotograficznych.

bigfotolab odczytuje zgodne metadane z Lightrooma, digiKama, darktable i ACDSee. Obsługiwane pola zależą od aplikacji.

### Odczytywanie istniejących metadanych

- Twoje oryginalne zdjęcia i filmy są zawsze zwykłymi plikami w istniejących folderach.
- Podczas indeksowania bigfotolab odczytuje osadzone dane EXIF, IPTC i XMP: datę wykonania, aparat, obiektyw, GPS, orientację, oceny, ulubione, słowa kluczowe, stany selekcji, opisy, tytuł, nagłówek, twórcę i prawa autorskie. Włącz **Ustawienia → Metadane → Importuj metadane**, aby zaimportować pola organizacyjne do lokalnej bazy. Lokalne zmiany zostają zachowane.
- Obsługiwane wartości z sidecarów XMP mają pierwszeństwo przed osadzonymi, również w przypadku GPS i daty wykonania.

### Zapisywanie obsługiwanych zmian do XMP

- Tytuł, nagłówek, opis, twórcę i prawa autorskie można edytować i zapisywać w lokalnej bazie danych.
- **Zapisz metadane do XMP** zapisuje do sidecarów tytuł, nagłówek, opis, twórcę i prawa autorskie, a także tagi (w tym hierarchiczne słowa kluczowe), oceny, ulubione i stany selekcji. Zachowuje pozostałe właściwości XMP i pozostawia oryginalne pliki bez zmian.
- Gdy zmieniasz nazwę, przenosisz, kopiujesz, usuwasz lub importujesz pliki **w bigfotolab**, bigfotolab aktualizuje jednocześnie swoją lokalną bazę danych. Utrzymuje też razem obsługiwane powiązane zasoby, takie jak składniki Apple Live Photo, sidecary XMP i AAE oraz włączone pary RAW + JPEG/HEIC. Z pary RAW można usunąć jeden plik lub oba. Gdy jeden plik zostaje, wspólny sidecar XMP pozostaje z pozostałym plikiem.
- Zapisanie edycji wykonanej wbudowanym edytorem zapisuje wynikowy obraz do wybranego miejsca docelowego.

### Co pozostaje w bazie danych bigfotolab

bigfotolab przechowuje te dane w lokalnej bazie danych lub konfiguracji biblioteki.

- Kolekcje, inteligentne albumy i ich reguły, grupowanie, sortowanie i kolejność
- Dane wyszukiwania AI, dane twarzy, miniatury oraz inne dane indeksów/cache
- Tagi, oceny, ulubione, stany selekcji i edytowalne pola tekstowe są przechowywane lokalnie i mogą zostać zapisane do XMP.

Zmiany pozostają w bazie, dopóki jawnie nie zapiszesz obsługiwanych pól do XMP. Kolekcje, inteligentne albumy oraz dane AI i twarzy nie trafiają do XMP. Wykonaj kopię zapasową bazy danych; skopiowanie samych oryginałów nie zachowa tej organizacji.

### Praca z plikami poza bigfotolab

bigfotolab może ponownie skanować foldery i wykrywać wiele zmian w systemie plików. Jednak zmiany dokonane poza bigfotolab — takie jak zmiana nazwy, przenoszenie, zastępowanie lub kopiowanie plików — mogą zakłócić porządek przechowywany wyłącznie w bigfotolab.

Po włączeniu importu metadanych bigfotolab sprawdza też zmiany w sidecarach XMP. Zmieniaj nazwy i przenoś pliki w bigfotolab, aby zachować ich dane w lokalnej bazie, w tym przynależność do kolekcji. Aby udostępnić obsługiwane metadane innym aplikacjom, użyj funkcji **Zapisz metadane do XMP** i zachowaj sidecar razem z plikiem. Jeśli zarządzasz plikami również poza bigfotolab, twórz kopie zapasowe bazy danych i konfiguracji bigfotolab razem ze zdjęciami. Lokalizacją bazy danych możesz zarządzać, a kopię zapasową utworzyć w **Ustawienia → Przechowywanie**.

Usunięcie bazy danych lub konfiguracji bigfotolab usuwa te lokalne dane porządkowania i indeksów, ale nie usuwa oryginalnych plików multimedialnych.

## Odinstaluj bigfotolab

bigfotolab działa bezpośrednio na istniejących folderach ze zdjęciami. Odinstalowanie bigfotolab lub usunięcie jego bazy danych i plików cache **nie usuwa** Twoich oryginalnych zdjęć.

Standardowe kroki odinstalowania usuwają aplikację. Aby usunąć bigfotolab całkowicie, najpierw zakończ działanie bigfotolab, odinstaluj aplikację, a następnie usuń jej lokalną bazę danych, cache miniatur i pliki konfiguracyjne, używając polecenia czyszczącego dla Twojej platformy.

### macOS

Jeśli zainstalowałeś bigfotolab przez Homebrew:

```bash
brew uninstall --cask lap
```

W przypadku instalacji ręcznej zakończ działanie bigfotolab i przenieś `bigfotolab.app` z folderu `Applications` do Kosza.

Aby usunąć wszystkie pliki bazy danych, cache i konfiguracji bigfotolab:

```bash
rm -rf "$HOME/Library/Application Support/com.bigfotolab.app" \
       "$HOME/Library/Caches/com.bigfotolab.app" \
       "$HOME/Library/WebKit/com.bigfotolab.app"
rm -f "$HOME/Library/Preferences/com.bigfotolab.app.plist"
```

### Windows

Otwórz **Ustawienia > Aplikacje > Zainstalowane aplikacje**, znajdź **bigfotolab** i wybierz **Odinstaluj**.

Następnie otwórz PowerShell i usuń wszystkie pliki bazy danych, cache i konfiguracji bigfotolab:

```powershell
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "$env:LOCALAPPDATA\com.bigfotolab.app"
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "$env:APPDATA\com.bigfotolab.app"
```

### Linux

W przypadku instalacji z pakietu DEB odinstaluj pakiet:

```bash
sudo apt remove bigfotolab
```

Aby usunąć lokalny pakiet Arch, użyj `sudo pacman -R bigfotolab`.

W przypadku instalacji AppImage zakończ działanie bigfotolab i usuń pobrany plik `.AppImage`.

Następnie usuń wszystkie pliki bazy danych, cache i konfiguracji bigfotolab:

```bash
rm -rf "$HOME/.local/share/com.bigfotolab.app" \
       "$HOME/.cache/com.bigfotolab.app" \
       "$HOME/.config/com.bigfotolab.app"
```

Jeśli w ustawieniach bigfotolab wybrałeś niestandardowy katalog przechowywania bazy danych, usuń ten katalog osobno po upewnieniu się, że zawiera wyłącznie pliki bazy danych bigfotolab.

## Budowanie ze źródeł

Wymagania: Node.js 20+, pnpm, Rust w wersji stabilnej.

```bash
# Zależności systemowe macOS
xcode-select --install
brew install nasm pkg-config autoconf automake libtool cmake

# Zależności systemowe Linux
# sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev \
#   patchelf nasm clang pkg-config autoconf automake libtool cmake

# Klonowanie i budowanie
git clone --recursive https://github.com/emmanuel-a-otchere/bigfotolab.git
cd lap
git submodule update --init --recursive
cargo install tauri-cli --version "^2.0.0" --locked
./scripts/download_models.sh            # Windows: .\scripts\download_models.ps1
./scripts/download_ffmpeg_sidecar.sh    # Windows: .\scripts\download_ffmpeg_sidecar.ps1
cd src-vite && pnpm install && cd ..
cargo tauri dev
```

Pakiety dystrybucyjne mogą linkować z systemową biblioteką libheif (1.17 lub nowszą) zamiast z dołączonymi libheif i libde265. Ustaw `LAP_SYSTEM_LIBHEIF=1` na czas budowania. Wówczas podmoduły `third_party/libheif` i `third_party/libde265` nie są potrzebne. Dekodowanie HEVC zależy od wtyczek kodeków systemowej biblioteki libheif.

### Arch Linux (x86_64)

Eksperymentalny przepis budowania dla Arch znajduje się w [`contrib/aur`](../contrib/aur/README.md). Nie został jeszcze opublikowany w AUR, więc `yay -S lap` nie jest jeszcze dostępne. Aby zbudować i zainstalować go lokalnie na Arch Linux:

```bash
cd contrib/aur
makepkg -s
sudo pacman -U lap-<version>-x86_64.pkg.tar.zst
```

Przepis przypina commit źródłowy z górnego repozytorium i weryfikuje sumami kontrolnymi dołączone modele AI oraz narzędzia FFmpeg. Build na Arch wyłącza samodzielne aktualizacje w aplikacji, aby aktualizacjami dalej zarządzał pacman; buildy na innych platformach zachowują dotychczasowy mechanizm aktualizacji. Szczegóły budowania i otwarte punkty kontroli wydania opisuje przewodnik przepisu.

## Obsługiwane formaty

bigfotolab obsługuje ponad 60 formatów obrazów, RAW i wideo.

| Typ | Formaty |
| :-- | :-- |
| Obrazy | JPG/JPEG/JFIF, PNG, GIF, BMP, TIFF, WebP, HEIC/HEIF/HIF, AVIF, JXL, PSD, EXR, HDR/RGBE, TGA, JPEG 2000 (JP2/J2K/J2C/JPC/JPF/JPX), DDS, DPX, QOI |
| Zdjęcia RAW | CR2, CR3, CRW, NEF, NRW, ARW, SRF, SR2, RAF, RW2, ORF, PEF, DNG, SRW, RWL, MRW, 3FR, MOS, IIQ, DCR, KDC, ERF, MEF, RAW, MDC |
| Dokumenty Affinity | AF, AFPHOTO, AFDESIGN, AFPUB (osadzony podgląd) |
| Filmy | MP4, MOV, M4V, MKV, AVI, FLV, TS/MTS/M2TS, WMV, WebM, 3GP, MPG/MPEG, VOB, MOD/TOD, HEVC, ASF. Odtwarzanie H.264 jest obsługiwane na wszystkich platformach, z automatycznym przetwarzaniem zgodności, gdy natywne odtwarzanie jest niedostępne. HEVC/H.265 i VP9 są natywnie obsługiwane w systemie macOS. |

### Odtwarzanie wideo w Linuksie

Jeśli filmy się nie odtwarzają, zainstaluj wtyczki GStreamer:

```bash
sudo apt install gstreamer1.0-libav gstreamer1.0-plugins-good
```

## Architektura

- Core: Tauri + Rust
- Frontend: Vue + Vite + Tailwind CSS
- Baza danych: SQLite

### Kluczowe biblioteki

| Biblioteka | Przeznaczenie |
| :-- | :-- |
| [LibRaw](https://github.com/LibRaw/LibRaw) | Dekodowanie zdjęć RAW i wyodrębnianie miniatur |
| [libheif](https://github.com/strukturag/libheif) | Dekodowanie obrazów HEIC/HEIF/HIF i generowanie podglądów |
| [libjpeg-turbo](https://libjpeg-turbo.org/) | Szybkie dekodowanie JPEG i generowanie miniatur |
| [FFmpeg](https://ffmpeg.org/) | Przetwarzanie wideo i generowanie miniatur |
| [exiftool-rs](https://github.com/Le-Syl21/exiftool-rs) | Port ExifTool na Rusta |
| [Video.js](https://videojs.com/) | Międzyplatformowy interfejs odtwarzania wideo |
| [ONNX Runtime](https://onnxruntime.ai/) | Lokalny silnik wnioskowania modeli AI |
| [CLIP](https://github.com/openai/CLIP) | Wyszukiwanie podobieństwa obraz–tekst |
| [InsightFace](https://github.com/deepinsight/insightface) | Wykrywanie i rozpoznawanie twarzy |
| [Leaflet](https://leafletjs.com/) | Interaktywna mapa dla zdjęć z geotagami |
| [daisyUI](https://daisyui.com/) | Biblioteka komponentów interfejsu |

## Licencja

GPL-3.0-or-later. Zobacz [LICENSE](../LICENSE).

## Prywatność

Przeczytaj [Politykę prywatności](../PRIVACY.md), aby poznać szczegóły dotyczące przetwarzania danych i opcjonalnych usług online.
