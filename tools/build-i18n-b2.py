"""
FLIP 10 — src/i18n.js を作るための元表（ビルド用の補助。アプリは読み込まない）

12言語ぶんの文言を1つの表にまとめ、`python3 tools/build-i18n-b2.py` で
src/i18n.js を書き出す。キーの抜けを構造的に防ぐのが目的。
文言を直すときはこの表を直してから再生成する。
"""

import json

LOCALES = [
    ("ja", "日本語", "ja-JP"),
    ("en", "English", "en-US"),
    ("ko", "한국어", "ko-KR"),
    ("zh-Hans", "简体中文", "zh-CN"),
    ("zh-Hant", "繁體中文", "zh-TW"),
    ("es", "Español", "es-ES"),
    ("fr", "Français", "fr-FR"),
    ("de", "Deutsch", "de-DE"),
    ("pt", "Português", "pt-BR"),
    ("it", "Italiano", "it-IT"),
    ("hi", "हिन्दी", "hi-IN"),
    ("id", "Bahasa Indonesia", "id-ID"),
]

SAME = {}


def key(name, ja, en, ko, zh_hans, zh_hant, es, fr, de, pt, it, hi, id_):
    return (name, [ja, en, ko, zh_hans, zh_hant, es, fr, de, pt, it, hi, id_])


def same(name, value):
    return (name, [value] * 12)


ROWS = [
    key("app.tagline",
        "2マスを入れ替えて、合計10で消す",
        "Swap two tiles. Sum to 10. Clear the line.",
        "두 칸을 바꿔 합계 10을 만들면 사라져요",
        "交换两个数字，凑成 10 就消除",
        "交換兩個數字，湊成 10 就消除",
        "Cambia dos fichas y suma 10 para eliminar",
        "Échangez deux cases et faites 10 pour effacer",
        "Tausche zwei Felder und summiere 10 zum Löschen",
        "Troque duas peças e some 10 para limpar",
        "Scambia due caselle e fai 10 per cancellare",
        "दो टाइल बदलकर 10 बनाएँ और लाइन मिटाएँ",
        "Tukar dua kotak, jumlahkan 10, hapus barisnya"),
    key("home.play", "あそぶ", "PLAY", "플레이", "开始", "開始", "JUGAR", "JOUER", "SPIELEN", "JOGAR", "GIOCA", "खेलें", "MAIN"),
    key("home.best", "ベスト", "BEST", "최고", "最高", "最高", "RÉCORD", "RECORD", "REKORD", "RECORDE", "RECORD", "सर्वश्रेष्ठ", "TERBAIK"),
    key("home.howto", "あそびかた", "How to play", "놀이 방법", "玩法", "玩法", "Cómo jugar", "Comment jouer", "Spielanleitung", "Como jogar", "Come giocare", "कैसे खेलें", "Cara bermain"),
    key("home.settings", "設定", "Settings", "설정", "设置", "設定", "Ajustes", "Réglages", "Einstellungen", "Ajustes", "Impostazioni", "सेटिंग", "Pengaturan"),
    same("home.pro", "PRO"),
    key("home.proOn", "PRO 解放中", "PRO unlocked", "PRO 사용 중", "PRO 已解锁", "PRO 已解鎖", "PRO activo", "PRO activé", "PRO aktiv", "PRO ativo", "PRO attivo", "PRO अनलॉक", "PRO terbuka"),
    key("mode.classic", "クラシック", "Classic", "클래식", "经典", "經典", "Clásico", "Classique", "Klassisch", "Clássico", "Classico", "क्लासिक", "Klasik"),
    key("mode.classic.desc",
        "4×4・入れ替え・手数ライフ",
        "4×4 · swap two tiles · move life",
        "4×4 · 두 칸 바꾸기 · 이동 생명",
        "4×4 · 交换两格 · 步数生命",
        "4×4 · 交換兩格 · 步數生命",
        "4×4 · cambia dos fichas · vidas de movimientos",
        "4×4 · échange deux cases · vies de coups",
        "4×4 · zwei Felder tauschen · Züge als Leben",
        "4×4 · troca duas peças · vidas de jogadas",
        "4×4 · scambia due caselle · vite a mosse",
        "4×4 · दो टाइल बदलें · चाल जीवन",
        "4×4 · tukar dua kotak · nyawa langkah"),
    key("mode.wide", "ワイド 5×5", "Wide 5×5", "와이드 5×5", "宽屏 5×5", "寬版 5×5", "Ancho 5×5", "Large 5×5", "Breit 5×5", "Largo 5×5", "Largo 5×5", "चौड़ा 5×5", "Lebar 5×5"),
    key("mode.wide.desc",
        "5×5・入れ替え・手数ライフ",
        "5×5 · swap · move life",
        "5×5 · 자리 바꾸기 · 이동 생명",
        "5×5 · 交换 · 步数生命",
        "5×5 · 交換 · 步數生命",
        "5×5 · cambia · vidas de movimientos",
        "5×5 · échange · vies de coups",
        "5×5 · tauschen · Züge als Leben",
        "5×5 · troca · vidas de jogadas",
        "5×5 · scambia · vite a mosse",
        "5×5 · बदलें · चाल जीवन",
        "5×5 · tukar · nyawa langkah"),
    key("mode.cross", "十字フリップ", "Cross Flip", "십자 플립", "十字翻转", "十字翻轉", "Giro en cruz", "Retour en croix", "Kreuz-Flip", "Virada em cruz", "Giro a croce", "क्रॉस फ्लिप", "Balik Silang"),
    key("mode.cross.desc",
        "4×4・＋の字が反転・表裏で5",
        "4×4 · plus shape flips · pairs sum to 5",
        "4×4 · 십자 모양 뒤집기 · 앞뒤 합 5",
        "4×4 · 十字翻转 · 正反合计 5",
        "4×4 · 十字翻轉 · 正反合計 5",
        "4×4 · gira en cruz · cara y dorso suman 5",
        "4×4 · retour en croix · face et dos font 5",
        "4×4 · Kreuz dreht · Vorder- und Rückseite = 5",
        "4×4 · virada em cruz · frente e verso somam 5",
        "4×4 · giro a croce · fronte e retro fanno 5",
        "4×4 · क्रॉस पलटें · आगे-पीछे 5",
        "4×4 · balik silang · depan-belakang 5"),
    key("mode.time", "タイムアタック", "Time Attack", "타임어택", "限时挑战", "限時挑戰", "Contrarreloj", "Contre-la-montre", "Zeitrennen", "Contra o tempo", "A tempo", "टाइम अटैक", "Kejar Waktu"),
    key("mode.time.desc",
        "60秒 / 120秒でスコア勝負",
        "60s / 120s score chase",
        "60초 / 120초 스코어 승부",
        "60秒 / 120秒 拼分数",
        "60秒 / 120秒 拼分數",
        "60 s / 120 s a por puntos",
        "60 s / 120 s pour le score",
        "60 s / 120 s auf Punkte",
        "60 s / 120 s por pontos",
        "60 s / 120 s a punti",
        "60 सेकंड / 120 सेकंड स्कोर",
        "60 dtk / 120 dtk kejar skor"),
    key("mode.locked", "PROで解放", "Unlock with PRO", "PRO로 해제", "用 PRO 解锁", "用 PRO 解鎖", "Desbloquea con PRO", "Débloquer avec PRO", "Mit PRO freischalten", "Desbloqueie com PRO", "Sblocca con PRO", "PRO से खोलें", "Buka dengan PRO"),
    key("hud.score", "スコア", "Score", "점수", "分数", "分數", "Puntos", "Score", "Punkte", "Pontos", "Punti", "स्कोर", "Skor"),
    key("hud.best", "ベスト", "Best", "최고", "最高", "最高", "Récord", "Record", "Rekord", "Recorde", "Record", "सर्वश्रेष्ठ", "Terbaik"),
    key("hud.moves", "手数", "Moves", "이동", "步数", "步數", "Movimientos", "Coups", "Züge", "Jogadas", "Mosse", "चालें", "Langkah"),
    key("hud.target", "合計", "Target", "목표", "合计", "合計", "Meta", "Objectif", "Ziel", "Meta", "Obiettivo", "लक्ष्य", "Jumlah"),
    key("hud.combo", "コンボ", "Combo", "콤보", "连击", "連擊", "Combo", "Combo", "Combo", "Combo", "Combo", "कॉम्बो", "Kombo"),
    key("hud.time", "のこり", "Time", "남은 시간", "剩余", "剩餘", "Tiempo", "Temps", "Zeit", "Tempo", "Tempo", "समय", "Waktu"),
    key("game.back", "ホームへ", "Home", "홈으로", "返回首页", "返回首頁", "Inicio", "Accueil", "Start", "Início", "Home", "होम", "Beranda"),
    key("game.restart", "やりなおす", "Restart", "다시 하기", "重新开始", "重新開始", "Reiniciar", "Recommencer", "Neu starten", "Recomeçar", "Ricomincia", "फिर से", "Mulai ulang"),
    key("game.settings", "設定", "Settings", "설정", "设置", "設定", "Ajustes", "Réglages", "Einstellungen", "Ajustes", "Impostazioni", "सेटिंग", "Pengaturan"),
    key("game.hint", "ヒント", "Hint", "힌트", "提示", "提示", "Pista", "Indice", "Tipp", "Dica", "Suggerimento", "संकेत", "Petunjuk"),
    key("howto.title", "あそびかた", "How to play", "놀이 방법", "玩法", "玩法", "Cómo jugar", "Comment jouer", "Spielanleitung", "Como jogar", "Come giocare", "कैसे खेलें", "Cara bermain"),
    key("howto.sub",
        "2マス入れ替えて、合計10で消すパズル",
        "Swap two tiles, sum to 10, clear the line",
        "두 칸을 바꿔 합계 10으로 지우는 퍼즐",
        "交换两格，合计 10 就消除的拼图",
        "交換兩格，合計 10 就消除的拼圖",
        "Cambia dos fichas y suma 10 para eliminar",
        "Échangez deux cases et faites 10 pour effacer",
        "Tausche zwei Felder und summiere 10 zum Löschen",
        "Troque duas peças e some 10 para limpar",
        "Scambia due caselle e fai 10 per cancellare",
        "दो टाइल बदलकर 10 बनाएँ और लाइन मिटाएँ",
        "Tukar dua kotak, jumlahkan 10, hapus barisnya"),
    key("howto.1.t",
        "2マスをタップで入れ替え",
        "Tap two tiles to swap them",
        "두 칸을 눌러 자리 바꾸기",
        "点两格交换位置",
        "點兩格交換位置",
        "Toca dos fichas para cambiarlas",
        "Touchez deux cases pour les échanger",
        "Tippe zwei Felder zum Tauschen",
        "Toque em duas peças para trocar",
        "Tocca due caselle per scambiarle",
        "दो टाइल दबाकर बदलें",
        "Ketuk dua kotak untuk menukar"),
    key("howto.1.b",
        "1マス目をタップすると青く光ります。次に別のマスをタップすると2つが入れ替わります。同じマスをもう一度押すと選び直せます。1回の入れ替えで手数が1つ減ります。",
        "Tap a tile and it lights up blue. Tap another tile and the two swap places. Tap the same tile again to cancel. Each swap costs one move.",
        "한 칸을 누르면 파랗게 빛납니다. 다른 칸을 누르면 두 칸이 자리를 바꿉니다. 같은 칸을 다시 누르면 취소됩니다. 한 번 바꿀 때마다 이동이 1 줄어듭니다.",
        "点第一格会亮起蓝光。再点另一格，两格就会交换。再点同一格可以重新选择。每次交换消耗 1 步。",
        "點第一格會亮起藍光。再點另一格，兩格就會交換。再點同一格可以重新選擇。每次交換消耗 1 步。",
        "Toca una ficha y se ilumina en azul. Toca otra y las dos cambian de sitio. Toca la misma ficha otra vez para cancelar. Cada cambio gasta un movimiento.",
        "Touchez une case : elle s'allume en bleu. Touchez-en une autre : les deux s'échangent. Touchez la même case pour annuler. Chaque échange coûte un coup.",
        "Tippe ein Feld an, es leuchtet blau. Tippe ein zweites an, beide tauschen. Nochmal dasselbe Feld bricht ab. Jeder Tausch kostet einen Zug.",
        "Toque numa peça e ela fica azul. Toque noutra e as duas trocam de lugar. Toque na mesma peça para cancelar. Cada troca gasta uma jogada.",
        "Tocca una casella: si illumina di blu. Tocca l'altra: le due si scambiano. Tocca di nuovo la stessa per annullare. Ogni scambio costa una mossa.",
        "एक टाइल दबाएँ तो वह नीली चमकती है। दूसरी दबाएँ तो दोनों जगह बदल लेती हैं। उसी टाइल को फिर दबाने से चयन हटता है। हर बदलाव में 1 चाल जाती है।",
        "Ketuk satu kotak, menyala biru. Ketuk kotak lain, keduanya bertukar. Ketuk kotak yang sama lagi untuk membatalkan. Setiap tukar memakai satu langkah."),
    key("howto.2.t",
        "合計は右と下にいつでも表示",
        "Every row and column total is always shown",
        "합계는 오른쪽과 아래에 항상 표시",
        "合计随时显示在右侧和底部",
        "合計隨時顯示在右側和底部",
        "Los totales de filas y columnas siempre a la vista",
        "Les totaux des lignes et colonnes toujours affichés",
        "Jede Zeilen- und Spaltensumme immer sichtbar",
        "Os totais de linhas e colunas sempre à vista",
        "I totali di righe e colonne sempre visibili",
        "हर पंक्ति और स्तंभ का कुल हमेशा दिखता है",
        "Jumlah tiap baris dan kolom selalu tampil"),
    key("howto.2.b",
        "右側に各行の合計、下側に各列の合計が出ます。合計に近い行・列は黄色く光って教えてくれます。",
        "Row totals run down the right edge, column totals along the bottom. Lines close to the target glow yellow.",
        "오른쪽에 각 행의 합계, 아래에 각 열의 합계가 나옵니다. 목표에 가까운 줄은 노랗게 빛납니다.",
        "右侧显示每行合计，底部显示每列合计。接近目标的行列会发出黄光。",
        "右側顯示每行合計，底部顯示每列合計。接近目標的行列會發出黃光。",
        "Las sumas de fila van por la derecha y las de columna por abajo. Las líneas cercanas a la meta brillan en amarillo.",
        "Les totaux de lignes sont à droite, ceux de colonnes en bas. Les lignes proches de l'objectif brillent en jaune.",
        "Zeilensummen stehen rechts, Spaltensummen unten. Fast passende Linien leuchten gelb.",
        "As somas das linhas ficam à direita e as das colunas embaixo. Linhas perto da meta brilham em amarelo.",
        "Le somme di riga sono a destra, quelle di colonna in basso. Le linee vicine all'obiettivo brillano di giallo.",
        "पंक्तियों का कुल दाईं ओर, स्तंभों का कुल नीचे। लक्ष्य के करीब की लाइनें पीली चमकती हैं।",
        "Jumlah baris di kanan, jumlah kolom di bawah. Baris yang dekat target bersinar kuning."),
    key("howto.3.t",
        "合計が10でラインが消える",
        "A line summing to 10 clears",
        "합계 10이면 줄이 사라져요",
        "合计 10 就消除整行",
        "合計 10 就消除整行",
        "Una línea que suma 10 se elimina",
        "Une ligne qui fait 10 s'efface",
        "Eine Linie mit Summe 10 verschwindet",
        "Uma linha que soma 10 é limpa",
        "Una linea che fa 10 si cancella",
        "10 का जोड़ होते ही लाइन मिटती है",
        "Baris berjumlah 10 akan terhapus"),
    key("howto.3.b",
        "そろった行・列は金色に光って消え、上から新しい数字が落ちてきます。続けて消えるとコンボで得点アップ。",
        "The line flashes gold, vanishes, and fresh digits drop in from above. Chain more clears for combo points.",
        "맞춘 줄은 금색으로 빛나며 사라지고 위에서 새 숫자가 떨어집니다. 연속으로 지우면 콤보 점수.",
        "凑齐的行列会闪金光消失，上方落下新的数字。连续消除可获得连击加分。",
        "湊齊的行列會閃金光消失，上方落下新的數字。連續消除可獲得連擊加分。",
        "La línea brilla en oro, desaparece y caen números nuevos desde arriba. Encadena para ganar combos.",
        "La ligne brille en or, disparaît et de nouveaux chiffres tombent. Enchaînez pour des combos.",
        "Die Linie leuchtet gold, verschwindet und neue Zahlen fallen herab. Ketten geben Combo-Punkte.",
        "A linha brilha em ouro, some e novos números caem. Encadeie para ganhar combos.",
        "La linea brilla d'oro, sparisce e nuovi numeri cadono dall'alto. Concatenali per i combo.",
        "लाइन सुनहरी चमक के साथ मिटती है और ऊपर से नए अंक गिरते हैं। लगातार मिटाने पर कॉम्बो अंक।",
        "Baris bersinar emas, hilang, dan angka baru jatuh dari atas. Beruntun memberi poin kombo."),
    key("howto.4.t",
        "手数ライフ：消すと回復",
        "Move life: clearing restores moves",
        "이동 생명: 지우면 회복",
        "步数生命：消除即回复",
        "步數生命：消除即回復",
        "Vidas de movimientos: eliminar las recarga",
        "Vies de coups : effacer les recharge",
        "Züge als Leben: Löschen füllt auf",
        "Vidas de jogadas: limpar recarrega",
        "Vite a mosse: cancellare le ricarica",
        "चाल जीवन: मिटाने पर चालें वापस",
        "Nyawa langkah: menghapus mengisi ulang"),
    key("howto.4.b",
        "手数は7からスタート。1ラインで+3、2ラインで+5、3ライン以上か連鎖で満タンの7に回復します。0になるとゲームオーバー。",
        "You start with 7 moves. One line restores 3, two lines 5, and three lines or a cascade fills back to 7. At 0 the game ends.",
        "이동 7로 시작. 1줄 +3, 2줄 +5, 3줄 이상이나 연쇄면 최대 7까지 회복. 0이면 게임 오버.",
        "从 7 步开始。消 1 行 +3、2 行 +5、3 行以上或连锁回满 7 步。步数为 0 时游戏结束。",
        "從 7 步開始。消 1 行 +3、2 行 +5、3 行以上或連鎖回滿 7 步。步數為 0 時遊戲結束。",
        "Empiezas con 7 movimientos. Una línea da 3, dos dan 5 y tres o una cadena rellenan hasta 7. Con 0 se acaba.",
        "Vous commencez avec 7 coups. Une ligne en rend 3, deux en rendent 5, trois ou une cascade remplissent à 7. À 0, fin de partie.",
        "Du startest mit 7 Zügen. Eine Linie gibt 3, zwei geben 5, drei oder eine Kette füllen auf 7. Bei 0 ist Schluss.",
        "Você começa com 7 jogadas. Uma linha devolve 3, duas 5, três ou uma cascata enchem até 7. Com 0, fim de jogo.",
        "Parti con 7 mosse. Una linea ne rende 3, due 5, tre o una cascata riempiono a 7. A 0 finisce.",
        "7 चालों से शुरू। 1 लाइन +3, 2 लाइन +5, 3 या श्रृंखला से 7 तक भर जाती हैं। 0 पर खेल खत्म।",
        "Mulai dengan 7 langkah. Satu baris +3, dua baris +5, tiga baris atau beruntun mengisi sampai 7. Di 0 permainan selesai."),
    key("howto.5.t",
        "PRO：十字フリップと合計設定",
        "PRO: Cross Flip + totals 9–40",
        "PRO: 십자 플립과 합계 9~40",
        "PRO：十字翻转与合计 9〜40",
        "PRO：十字翻轉與合計 9〜40",
        "PRO: giro en cruz y totales 9–40",
        "PRO : retour en croix et totaux 9–40",
        "PRO: Kreuz-Flip und Summen 9–40",
        "PRO: virada em cruz e totais 9–40",
        "PRO: giro a croce e totali 9–40",
        "PRO: क्रॉस फ्लिप और कुल 9–40",
        "PRO: balik silang dan jumlah 9–40"),
    key("howto.5.b",
        "PROでは＋の字が反転する十字フリップ（表裏で5）、5×5、タイムアタック、行と列それぞれ9〜40の合計設定が使えます。",
        "PRO adds Cross Flip (a plus shape flips, front + back = 5), a 5×5 board, Time Attack, and row/column totals from 9 to 40.",
        "PRO에서는 십자 플립(앞뒤 합 5), 5×5, 타임어택, 행과 열 각각 9~40 합계 설정을 쓸 수 있습니다.",
        "PRO 可使用十字翻转（正反合计 5）、5×5、限时挑战，以及行列各自 9〜40 的合计设置。",
        "PRO 可使用十字翻轉（正反合計 5）、5×5、限時挑戰，以及行列各自 9〜40 的合計設定。",
        "PRO añade giro en cruz (cara y dorso suman 5), tablero 5×5, contrarreloj y totales de 9 a 40 por fila y columna.",
        "PRO ajoute le retour en croix (face + dos = 5), un plateau 5×5, le contre-la-montre et des totaux de 9 à 40 par ligne et colonne.",
        "PRO bringt Kreuz-Flip (Vorder- und Rückseite = 5), 5×5, Zeitrennen und Summen von 9 bis 40 je Zeile und Spalte.",
        "PRO traz virada em cruz (frente + verso = 5), tabuleiro 5×5, contra o tempo e totais de 9 a 40 por linha e coluna.",
        "PRO aggiunge giro a croce (fronte + retro = 5), tavola 5×5, a tempo e totali da 9 a 40 per riga e colonna.",
        "PRO में क्रॉस फ्लिप (आगे + पीछे = 5), 5×5, टाइम अटैक और पंक्ति/स्तंभ के 9–40 कुल मिलते हैं।",
        "PRO menambah balik silang (depan + belakang = 5), papan 5×5, kejar waktu, dan jumlah 9–40 per baris/kolom."),
    key("howto.tip",
        "迷ったらヒント。合計10に近い行や列から狙おう。",
        "Stuck? Use a hint and start from the line closest to 10.",
        "막히면 힌트. 10에 가까운 줄부터 노려요.",
        "卡住了就点提示，从接近 10 的行列开始。",
        "卡住了就點提示，從接近 10 的行列開始。",
        "¿Atascado? Usa una pista y empieza por la línea más cercana a 10.",
        "Bloqué ? Utilisez un indice et partez de la ligne la plus proche de 10.",
        "Festgefahren? Nutze einen Tipp und beginne bei der Linie, die 10 am nächsten ist.",
        "Travado? Use uma dica e comece pela linha mais perto de 10.",
        "Bloccato? Usa un suggerimento e parti dalla linea più vicina a 10.",
        "अटक गए? संकेत लें और 10 के सबसे करीब वाली लाइन से शुरू करें।",
        "Buntu? Pakai petunjuk dan mulai dari baris yang paling dekat dengan 10."),
    key("howto.legend",
        "十字フリップは表と裏で5",
        "Cross Flip: front + back = 5",
        "십자 플립은 앞뒤 합 5",
        "十字翻转：正反合计 5",
        "十字翻轉：正反合計 5",
        "Giro en cruz: cara + dorso = 5",
        "Retour en croix : face + dos = 5",
        "Kreuz-Flip: Vorderseite + Rückseite = 5",
        "Virada em cruz: frente + verso = 5",
        "Giro a croce: fronte + retro = 5",
        "क्रॉस फ्लिप: आगे + पीछे = 5",
        "Balik silang: depan + belakang = 5"),
    key("settings.title", "設定", "Settings", "설정", "设置", "設定", "Ajustes", "Réglages", "Einstellungen", "Ajustes", "Impostazioni", "सेटिंग", "Pengaturan"),
    key("settings.sound", "効果音", "Sound effects", "효과음", "音效", "音效", "Efectos de sonido", "Effets sonores", "Soundeffekte", "Efeitos sonoros", "Effetti sonori", "ध्वनि प्रभाव", "Efek suara"),
    key("settings.bgm", "BGM", "Music", "배경음악", "背景音乐", "背景音樂", "Música", "Musique", "Musik", "Música", "Musica", "संगीत", "Musik"),
    key("settings.hint", "ヒント", "Hint", "힌트", "提示", "提示", "Pista", "Indice", "Tipp", "Dica", "Suggerimento", "संकेत", "Petunjuk"),
    key("settings.haptic", "バイブ（ふるえ）", "Vibration", "진동", "振动", "震動", "Vibración", "Vibration", "Vibration", "Vibração", "Vibrazione", "कंपन", "Getar"),
    key("settings.language", "言語", "Language", "언어", "语言", "語言", "Idioma", "Langue", "Sprache", "Idioma", "Lingua", "भाषा", "Bahasa"),
    key("settings.textSize", "文字サイズ", "Text size", "글자 크기", "文字大小", "文字大小", "Tamaño de texto", "Taille du texte", "Textgröße", "Tamanho do texto", "Dimensione testo", "अक्षर आकार", "Ukuran teks"),
    key("settings.textSize.normal", "標準", "Normal", "보통", "标准", "標準", "Normal", "Normal", "Normal", "Normal", "Normale", "सामान्य", "Normal"),
    key("settings.textSize.large", "大きめ", "Large", "크게", "大", "大", "Grande", "Grand", "Groß", "Grande", "Grande", "बड़ा", "Besar"),
    key("settings.textSize.xl", "特大", "Extra large", "아주 크게", "特大", "特大", "Muy grande", "Très grand", "Sehr groß", "Muito grande", "Molto grande", "बहुत बड़ा", "Sangat besar"),
    key("settings.target", "消える合計（PRO）", "Line totals (PRO)", "사라지는 합계 (PRO)", "消除合计（PRO）", "消除合計（PRO）", "Totales de línea (PRO)", "Totaux de ligne (PRO)", "Liniensummen (PRO)", "Totais de linha (PRO)", "Totali di linea (PRO)", "लाइन कुल (PRO)", "Jumlah baris (PRO)"),
    key("settings.targetRow", "行", "Row", "행", "行", "列", "Fila", "Ligne", "Zeile", "Linha", "Riga", "पंक्ति", "Baris"),
    key("settings.targetCol", "列", "Column", "열", "列", "欄", "Columna", "Colonne", "Spalte", "Coluna", "Colonna", "स्तंभ", "Kolom"),
    key("settings.targetNote",
        "PROの設定です。行と列を別々に9〜40で選べます。次のゲームから適用されます。",
        "PRO setting. Row and column totals can be set separately from 9 to 40. Applies from the next game.",
        "PRO 설정입니다. 행과 열을 각각 9~40으로 정할 수 있습니다. 다음 게임부터 적용됩니다.",
        "PRO 设置。行和列可分别设定 9〜40。下一局开始生效。",
        "PRO 設定。行和列可分別設定 9〜40。下一局開始生效。",
        "Ajuste PRO. Filas y columnas se ajustan por separado de 9 a 40. Se aplica desde la próxima partida.",
        "Réglage PRO. Lignes et colonnes se règlent séparément de 9 à 40. Appliqué à la prochaine partie.",
        "PRO-Einstellung. Zeilen und Spalten lassen sich getrennt von 9 bis 40 einstellen. Gilt ab dem nächsten Spiel.",
        "Ajuste PRO. Linhas e colunas podem ser definidas separadamente de 9 a 40. Vale a partir da próxima partida.",
        "Impostazione PRO. Righe e colonne si impostano separatamente da 9 a 40. Vale dalla prossima partita.",
        "PRO सेटिंग। पंक्ति और स्तंभ अलग-अलग 9–40 तक चुने जा सकते हैं। अगले खेल से लागू।",
        "Pengaturan PRO. Baris dan kolom bisa diatur terpisah 9–40. Berlaku mulai permainan berikutnya."),
    key("settings.targetCap",
        "4×4の盤面は最大36（9×4）です。",
        "On a 4×4 board the maximum is 36 (9×4).",
        "4×4 판은 최대 36(9×4)입니다.",
        "4×4 盘面最大为 36（9×4）。",
        "4×4 盤面最大為 36（9×4）。",
        "En un tablero 4×4 el máximo es 36 (9×4).",
        "Sur un plateau 4×4, le maximum est 36 (9×4).",
        "Auf einem 4×4-Brett sind höchstens 36 möglich (9×4).",
        "Num tabuleiro 4×4 o máximo é 36 (9×4).",
        "Su una tavola 4×4 il massimo è 36 (9×4).",
        "4×4 बोर्ड पर अधिकतम 36 (9×4) है।",
        "Di papan 4×4 maksimalnya 36 (9×4)."),
    key("settings.rules", "ルール", "Rules", "규칙", "规则", "規則", "Reglas", "Règles", "Regeln", "Regras", "Regole", "नियम", "Aturan"),
    key("settings.privacy", "プライバシーポリシー", "Privacy policy", "개인정보 처리방침", "隐私政策", "隱私權政策", "Política de privacidad", "Politique de confidentialité", "Datenschutz", "Política de privacidade", "Informativa sulla privacy", "गोपनीयता नीति", "Kebijakan privasi"),
    key("settings.reset", "ベストスコアを消す", "Erase best scores", "최고 점수 지우기", "清除最高分", "清除最高分", "Borrar récords", "Effacer les records", "Bestwerte löschen", "Apagar recordes", "Cancella record", "सर्वश्रेष्ठ स्कोर मिटाएँ", "Hapus skor terbaik"),
    key("settings.version", "バージョン", "Version", "버전", "版本", "版本", "Versión", "Version", "Version", "Versão", "Versione", "संस्करण", "Versi"),
    same("settings.on", "ON"),
    same("settings.off", "OFF"),
    key("rules.swap",
        "1手で好きな2マスを入れ替え（手数 −1）",
        "Each move swaps any two tiles (moves −1)",
        "한 수에 원하는 두 칸을 바꾸기 (이동 −1)",
        "每步交换任意两格（步数 −1）",
        "每步交換任意兩格（步數 −1）",
        "Cada movimiento cambia dos fichas (movimientos −1)",
        "Chaque coup échange deux cases (coups −1)",
        "Jeder Zug tauscht zwei Felder (Züge −1)",
        "Cada jogada troca duas peças (jogadas −1)",
        "Ogni mossa scambia due caselle (mosse −1)",
        "हर चाल में कोई दो टाइल बदलें (चालें −1)",
        "Tiap langkah menukar dua kotak (langkah −1)"),
    key("rules.line",
        "行 {row} / 列 {col} の合計でラインが消える",
        "Lines clear at row {row} / column {col}",
        "행 {row} / 열 {col} 합계에서 줄이 사라짐",
        "行 {row} / 列 {col} 的合计消除整行",
        "行 {row} / 列 {col} 的合計消除整行",
        "Las líneas se eliminan con fila {row} / columna {col}",
        "Les lignes s'effacent à ligne {row} / colonne {col}",
        "Linien verschwinden bei Zeile {row} / Spalte {col}",
        "Linhas são limpas com linha {row} / coluna {col}",
        "Le line si cancellano a riga {row} / colonna {col}",
        "पंक्ति {row} / स्तंभ {col} के कुल पर लाइन मिटती है",
        "Baris terhapus pada baris {row} / kolom {col}"),
    key("rules.moves",
        "消すと手数回復: 1ライン +3 / 2ライン +5 / 3ライン以上か連鎖で満タン",
        "Clearing restores moves: 1 line +3 / 2 lines +5 / 3+ or a cascade fills up",
        "지우면 이동 회복: 1줄 +3 / 2줄 +5 / 3줄 이상이나 연쇄면 가득",
        "消除回复步数：1 行 +3 / 2 行 +5 / 3 行以上或连锁回满",
        "消除回復步數：1 行 +3 / 2 行 +5 / 3 行以上或連鎖回滿",
        "Eliminar recarga movimientos: 1 línea +3 / 2 +5 / 3 o cadena al máximo",
        "Effacer recharge les coups : 1 ligne +3 / 2 +5 / 3 ou cascade au max",
        "Löschen füllt Züge: 1 Linie +3 / 2 +5 / 3 oder Kette voll",
        "Limpar recarrega jogadas: 1 linha +3 / 2 +5 / 3 ou cascata cheio",
        "Cancellare ricarica mosse: 1 linea +3 / 2 +5 / 3 o cascata al massimo",
        "मिटाने पर चालें: 1 लाइन +3 / 2 +5 / 3 या श्रृंखला से पूरी",
        "Menghapus mengisi langkah: 1 baris +3 / 2 +5 / 3 atau beruntun penuh"),
    key("pro.title", "FLIP 10 PRO", "FLIP 10 PRO", "FLIP 10 PRO", "FLIP 10 PRO", "FLIP 10 PRO", "FLIP 10 PRO", "FLIP 10 PRO", "FLIP 10 PRO", "FLIP 10 PRO", "FLIP 10 PRO", "FLIP 10 PRO", "FLIP 10 PRO"),
    key("pro.sub", "買い切り。ずっと使えます。", "One-time purchase. Yours for good.", "한 번 구매. 계속 사용.", "一次买断，永久使用。", "一次買斷，永久使用。", "Pago único. Para siempre.", "Achat unique. À vie.", "Einmal kaufen. Für immer.", "Compra única. Para sempre.", "Acquisto singolo. Per sempre.", "एक बार खरीदें। हमेशा के लिए।", "Sekali beli. Milikmu selamanya."),
    key("pro.f1",
        "十字フリップ特別モード（＋の字が反転・表裏で5）",
        "Cross Flip special mode (plus shape flips, pairs sum to 5)",
        "십자 플립 특별 모드 (십자 뒤집기, 앞뒤 합 5)",
        "十字翻转特别模式（十字翻转・正反合计 5）",
        "十字翻轉特別模式（十字翻轉・正反合計 5）",
        "Modo especial giro en cruz (gira en cruz, cara y dorso suman 5)",
        "Mode spécial retour en croix (croix qui se retourne, face + dos = 5)",
        "Kreuz-Flip-Sondermodus (Kreuz dreht, Vorder-/Rückseite = 5)",
        "Modo especial virada em cruz (vira em cruz, frente + verso = 5)",
        "Modalità speciale giro a croce (croce che gira, fronte + retro = 5)",
        "क्रॉस फ्लिप विशेष मोड (क्रॉस पलटता है, आगे + पीछे = 5)",
        "Mode khusus balik silang (silang berbalik, depan + belakang = 5)"),
    key("pro.f2", "5×5 ボード", "5×5 board", "5×5 보드", "5×5 盘面", "5×5 盤面", "Tablero 5×5", "Plateau 5×5", "5×5-Brett", "Tabuleiro 5×5", "Tavola 5×5", "5×5 बोर्ड", "Papan 5×5"),
    key("pro.f3", "タイムアタック 60秒 / 120秒", "Time Attack 60s / 120s", "타임어택 60초 / 120초", "限时挑战 60秒 / 120秒", "限時挑戰 60秒 / 120秒", "Contrarreloj 60 s / 120 s", "Contre-la-montre 60 s / 120 s", "Zeitrennen 60 s / 120 s", "Contra o tempo 60 s / 120 s", "A tempo 60 s / 120 s", "टाइम अटैक 60 / 120 सेकंड", "Kejar Waktu 60 / 120 dtk"),
    key("pro.f4",
        "行と列の合計を9〜40で自由に設定",
        "Set row and column totals freely from 9 to 40",
        "행과 열 합계를 9~40으로 자유 설정",
        "行列合计可自由设定 9〜40",
        "行列合計可自由設定 9〜40",
        "Ajusta los totales de fila y columna de 9 a 40",
        "Réglez les totaux de ligne et colonne de 9 à 40",
        "Zeilen- und Spaltensummen frei von 9 bis 40",
        "Ajuste totais de linha e coluna de 9 a 40",
        "Imposta i totali di riga e colonna da 9 a 40",
        "पंक्ति और स्तंभ कुल 9–40 तक सेट करें",
        "Atur jumlah baris dan kolom 9–40"),
    key("pro.f5", "広告なし・オフラインで遊べる", "No ads · plays offline", "광고 없음 · 오프라인 플레이", "无广告 · 离线可玩", "無廣告 · 離線可玩", "Sin anuncios · sin conexión", "Sans pub · hors ligne", "Keine Werbung · offline", "Sem anúncios · offline", "Senza pubblicità · offline", "विज्ञापन नहीं · ऑफलाइन", "Tanpa iklan · offline"),
    key("pro.buy", "{price} で解放", "Unlock for {price}", "{price}로 해제", "{price} 解锁", "{price} 解鎖", "Desbloquear por {price}", "Débloquer pour {price}", "Für {price} freischalten", "Desbloquear por {price}", "Sblocca per {price}", "{price} में खोलें", "Buka dengan {price}"),
    key("pro.restore", "購入を復元", "Restore purchase", "구매 복원", "恢复购买", "恢復購買", "Restaurar compra", "Restaurer l'achat", "Kauf wiederherstellen", "Restaurar compra", "Ripristina acquisto", "खरीद बहाल करें", "Pulihkan pembelian"),
    key("pro.dev", "テスト用プレビュー（App Store 未設定）", "Test preview (App Store not set up)", "테스트 미리보기 (App Store 미설정)", "测试预览（未设置 App Store）", "測試預覽（未設定 App Store）", "Vista de prueba (App Store sin configurar)", "Aperçu de test (App Store non configuré)", "Testvorschau (App Store nicht eingerichtet)", "Prévia de teste (App Store não configurado)", "Anteprima di test (App Store non configurato)", "टेस्ट प्रीव्यू (App Store सेट नहीं)", "Pratinjau uji (App Store belum diatur)"),
    key("pro.devNote", "このスイッチは開発確認用です。本番の購入とは別物で、アプリを消すと戻ります。", "This switch is for development only. It is not a real purchase and resets if the app is removed.", "이 스위치는 개발 확인용입니다. 실제 구매와 무관하며 앱을 지우면 초기화됩니다.", "此开关仅用于开发确认，与正式购买无关，删除应用后会重置。", "此開關僅用於開發確認，與正式購買無關，刪除應用程式後會重置。", "Este interruptor es solo para desarrollo. No es una compra real y se reinicia al borrar la app.", "Cet interrupteur sert au développement. Ce n'est pas un achat réel et il disparaît si l'app est supprimée.", "Dieser Schalter ist nur für die Entwicklung. Kein echter Kauf; beim Löschen der App zurückgesetzt.", "Este botão é só para desenvolvimento. Não é uma compra real e some ao apagar o app.", "Questo interruttore è solo per lo sviluppo. Non è un acquisto reale e si azzera cancellando l'app.", "यह स्विच केवल विकास जाँच के लिए है। असली खरीद नहीं, ऐप हटाने पर रीसेट।", "Sakelar ini hanya untuk pengembangan. Bukan pembelian sungguhan dan hilang bila aplikasi dihapus."),
    key("pro.note", "支払いは Apple ID に請求されます。買い切りで、定期購入ではありません。", "Payment is charged to your Apple ID. One-time purchase, not a subscription.", "결제는 Apple ID로 청구됩니다. 정기 구독이 아닌 1회 구매입니다.", "费用计入 Apple ID。一次买断，不是订阅。", "費用計入 Apple ID。一次買斷，不是訂閱。", "El pago se carga a tu Apple ID. Compra única, no es suscripción.", "Le paiement est débité sur votre Apple ID. Achat unique, pas un abonnement.", "Die Zahlung geht an deine Apple ID. Einmalkauf, kein Abo.", "O pagamento vai para o seu Apple ID. Compra única, não é assinatura.", "Il pagamento va sul tuo Apple ID. Acquisto singolo, non abbonamento.", "भुगतान Apple ID पर लगेगा। एक बार की खरीद, सदस्यता नहीं।", "Pembayaran ditagih ke Apple ID Anda. Sekali beli, bukan langganan."),
    key("pro.thanks", "PRO を解放しました。十字フリップ・5×5・タイムアタック・合計設定が使えます。", "PRO unlocked. Cross Flip, 5×5, Time Attack and custom totals are ready.", "PRO가 열렸습니다. 십자 플립, 5×5, 타임어택, 합계 설정을 쓸 수 있습니다.", "PRO 已解锁。十字翻转、5×5、限时挑战、合计设置均可使用。", "PRO 已解鎖。十字翻轉、5×5、限時挑戰、合計設定均可使用。", "PRO desbloqueado. Ya tienes giro en cruz, 5×5, contrarreloj y totales a medida.", "PRO débloqué. Retour en croix, 5×5, contre-la-montre et totaux personnalisés.", "PRO freigeschaltet. Kreuz-Flip, 5×5, Zeitrennen und eigene Summen sind da.", "PRO desbloqueado. Virada em cruz, 5×5, contra o tempo e totais livres.", "PRO sbloccato. Giro a croce, 5×5, a tempo e totali personalizzati.", "PRO खुल गया। क्रॉस फ्लिप, 5×5, टाइम अटैक और कुल सेटिंग तैयार।", "PRO terbuka. Balik silang, 5×5, kejar waktu, dan jumlah bebas siap."),
    key("pro.restored", "購入を復元しました。", "Purchase restored.", "구매를 복원했습니다.", "已恢复购买。", "已恢復購買。", "Compra restaurada.", "Achat restauré.", "Kauf wiederhergestellt.", "Compra restaurada.", "Acquisto ripristinato.", "खरीद बहाल हुई।", "Pembelian dipulihkan."),
    key("pro.nothing", "復元できる購入が見つかりませんでした。", "No purchase to restore.", "복원할 구매가 없습니다.", "没有可恢复的购买。", "沒有可恢復的購買。", "No hay compras que restaurar.", "Aucun achat à restaurer.", "Kein Kauf zum Wiederherstellen.", "Nenhuma compra para restaurar.", "Nessun acquisto da ripristinare.", "बहाल करने के लिए कोई खरीद नहीं।", "Tidak ada pembelian untuk dipulihkan."),
    key("pro.fail", "購入を完了できませんでした。時間をおいて試してください。", "The purchase could not be completed. Please try again later.", "구매를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.", "未能完成购买，请稍后再试。", "未能完成購買，請稍後再試。", "No se pudo completar la compra. Inténtalo más tarde.", "L'achat n'a pas pu aboutir. Réessayez plus tard.", "Der Kauf konnte nicht abgeschlossen werden. Bitte später erneut versuchen.", "Não foi possível concluir a compra. Tente mais tarde.", "Impossibile completare l'acquisto. Riprova più tardi.", "खरीद पूरी नहीं हो सकी। थोड़ी देर बाद फिर कोशिश करें।", "Pembelian tidak selesai. Coba lagi nanti."),
    key("privacy.title", "プライバシーポリシー", "Privacy policy", "개인정보 처리방침", "隐私政策", "隱私權政策", "Política de privacidad", "Politique de confidentialité", "Datenschutz", "Política de privacidade", "Informativa sulla privacy", "गोपनीयता नीति", "Kebijakan privasi"),
    key("privacy.updated", "最終更新日: 2026年11月23日", "Last updated: 23 November 2026", "최종 업데이트: 2026년 11월 23일", "最后更新: 2026年11月23日", "最後更新: 2026年11月23日", "Última actualización: 23 de noviembre de 2026", "Dernière mise à jour : 23 novembre 2026", "Zuletzt aktualisiert: 23. November 2026", "Última atualização: 23 de novembro de 2026", "Ultimo aggiornamento: 23 novembre 2026", "अंतिम अपडेट: 23 नवंबर 2026", "Terakhir diperbarui: 23 November 2026"),
    key("privacy.enNote", "このポリシーの全文は日本語と英語で用意しています。ほかの言語では英語を表示します。", "The full policy is written in Japanese and English. Other languages show the English text.", "이 정책 전문은 일본어와 영어로 준비되어 있습니다. 다른 언어에서는 영어를 표시합니다.", "本政策全文提供日语和英语。其他语言显示英文。", "本政策全文提供日語和英語。其他語言顯示英文。", "La política completa está en japonés e inglés. Otros idiomas muestran el inglés.", "La politique complète est en japonais et en anglais. Les autres langues affichent l'anglais.", "Die vollständige Richtlinie gibt es auf Japanisch und Englisch. Andere Sprachen zeigen Englisch.", "A política completa está em japonês e inglês. Outros idiomas mostram o inglês.", "L'informativa completa è in giapponese e inglese. Le altre lingue mostrano l'inglese.", "पूरी नीति जापानी और अंग्रेज़ी में है। अन्य भाषाओं में अंग्रेज़ी दिखती है।", "Kebijakan lengkap tersedia dalam bahasa Jepang dan Inggris. Bahasa lain menampilkan teks Inggris."),
    key("result.title", "RESULT", "RESULT", "결과", "结果", "結果", "RESULTADO", "RÉSULTAT", "ERGEBNIS", "RESULTADO", "RISULTATO", "परिणाम", "HASIL"),
    key("result.movesOut", "手数がなくなりました", "Out of moves", "이동이 모두 떨어졌습니다", "步数用完了", "步數用完了", "Sin movimientos", "Plus de coups", "Keine Züge mehr", "Sem jogadas", "Mosse esaurite", "चालें खत्म", "Langkah habis"),
    key("result.timeUp", "タイムアップ！", "Time's up!", "타임업!", "时间到！", "時間到！", "¡Tiempo!", "Temps écoulé !", "Zeit um!", "Tempo esgotado!", "Tempo scaduto!", "समय समाप्त!", "Waktu habis!"),
    key("result.score", "スコア", "Score", "점수", "分数", "分數", "Puntos", "Score", "Punkte", "Pontos", "Punti", "स्कोर", "Skor"),
    key("result.best", "ベスト", "Best", "최고", "最高", "最高", "Récord", "Record", "Rekord", "Recorde", "Record", "सर्वश्रेष्ठ", "Terbaik"),
    key("result.newRecord", "自己ベスト更新！", "New personal best!", "자기 최고 기록!", "刷新个人最佳！", "刷新個人最佳！", "¡Nuevo récord personal!", "Nouveau record personnel !", "Neuer persönlicher Rekord!", "Novo recorde pessoal!", "Nuovo record personale!", "नया व्यक्तिगत रिकॉर्ड!", "Rekor pribadi baru!"),
    key("result.lines", "消したライン", "Lines cleared", "지운 줄", "消除行数", "消除行數", "Líneas eliminadas", "Lignes effacées", "Gelöschte Linien", "Linhas limpas", "Linee cancellate", "मिटाई लाइनें", "Baris terhapus"),
    key("result.again", "もう一度", "Play again", "다시 하기", "再来一局", "再來一局", "Jugar otra vez", "Rejouer", "Nochmal", "Jogar de novo", "Gioca ancora", "फिर खेलें", "Main lagi"),
    key("result.home", "ホームへ", "Home", "홈으로", "返回首页", "返回首頁", "Inicio", "Accueil", "Start", "Início", "Home", "होम", "Beranda"),
    key("toast.reset", "ベストスコアを消しました。", "Best scores erased.", "최고 점수를 지웠습니다.", "已清除最高分。", "已清除最高分。", "Récords borrados.", "Records effacés.", "Bestwerte gelöscht.", "Recordes apagados.", "Record cancellati.", "सर्वश्रेष्ठ स्कोर मिटा दिए।", "Skor terbaik dihapus."),
    key("toast.shuffle", "手がなくなったので数字を混ぜました。", "No moves left on that board — the digits were shuffled.", "둘 수 있는 수가 없어 숫자를 섞었습니다.", "没有可走的一步，已重新混合数字。", "沒有可走的一步，已重新混合數字。", "No había jugadas: se mezclaron los números.", "Plus de coup possible : les chiffres ont été mélangés.", "Kein Zug möglich: Zahlen wurden gemischt.", "Sem jogada possível: os números foram misturados.", "Nessuna mossa possibile: numeri rimescolati.", "कोई चाल नहीं थी, अंक मिला दिए।", "Tidak ada langkah: angka diacak."),
    key("toast.target", "行 {row} / 列 {col} にしました。", "Row {row} / column {col}.", "행 {row} / 열 {col}로 했습니다.", "已设为行 {row} / 列 {col}。", "已設為行 {row} / 列 {col}。", "Fila {row} / columna {col}.", "Ligne {row} / colonne {col}.", "Zeile {row} / Spalte {col}.", "Linha {row} / coluna {col}.", "Riga {row} / colonna {col}.", "पंक्ति {row} / स्तंभ {col}.", "Baris {row} / kolom {col}."),
    key("toast.cap", "4×4は36までなので36にしました。", "A 4×4 board tops out at 36, so it was set to 36.", "4×4는 36까지라 36으로 했습니다.", "4×4 最大为 36，已设为 36。", "4×4 最大為 36，已設為 36。", "En 4×4 el máximo es 36, así que se ajustó a 36.", "Sur 4×4, le maximum est 36 : réglé sur 36.", "4×4 geht bis 36, daher auf 36 gesetzt.", "No 4×4 o máximo é 36, então ficou 36.", "Su 4×4 il massimo è 36, quindi impostato a 36.", "4×4 में अधिकतम 36 है, इसलिए 36 किया।", "Di 4×4 maksimal 36, jadi diatur ke 36."),
    same("combo.nice", "NICE!"),
    same("combo.great", "GREAT!"),
    same("combo.super", "SUPER!"),
    same("combo.amazing", "AMAZING!"),
    same("combo.fever", "FEVER!!"),
    key("common.close", "閉じる", "Close", "닫기", "关闭", "關閉", "Cerrar", "Fermer", "Schließen", "Fechar", "Chiudi", "बंद करें", "Tutup"),
    key("common.cancel", "キャンセル", "Cancel", "취소", "取消", "取消", "Cancelar", "Annuler", "Abbrechen", "Cancelar", "Annulla", "रद्द करें", "Batal"),
]

PRESENTATION = {
    "privacy": {
        "ja": {
            "intro": "FLIP 10（以下「本アプリ」）は、T-maks Games が提供する1人用パズルゲームです。本アプリは完全にオフラインで動き、アカウント登録もなく、個人情報を集めません。",
            "sections": [
                ("集めない情報", "氏名・メールアドレス・電話番号・位置情報・連絡先・写真・端末を特定できる情報は、一切集めません。入力欄もありません。"),
                ("端末の中に残るもの", "スコア、ベスト記録、設定（音・BGM・ヒント・文字サイズ・言語・消える合計）は、この端末の中（アプリの保存領域）だけに保存されます。外部へ送信しません。アプリを消すと一緒に消えます。"),
                ("通信と広告", "本アプリはサーバーと通信しません。広告・解析・トラッキングのSDKも入っていません。"),
                ("購入について", "PRO（買い切り）の決済は Apple の App Store が処理します。本アプリがクレジットカード情報を受け取ることはありません。購入の確認は端末内の StoreKit だけで行います。"),
                ("お問い合わせ", "本アプリとこのポリシーについてのご連絡は t.maks.ts@gmail.com までお願いします。"),
            ],
        },
        "en": {
            "intro": "FLIP 10 (the \"App\") is a single-player puzzle game provided by T-maks Games. The App runs entirely offline, has no account, and does not collect personal information.",
            "sections": [
                ("What we do not collect", "We do not collect your name, email address, phone number, location, contacts, photos, or any device identifier. The App has no text input fields."),
                ("What stays on your device", "Scores, best records and settings (sound, music, hint, text size, language, line totals) are stored only on this device, inside the App's own storage. They are never sent anywhere and are removed with the App."),
                ("Network and advertising", "The App does not contact any server. It contains no advertising, analytics or tracking SDKs."),
                ("Purchases", "Payment for PRO (a one-time purchase) is handled by Apple's App Store. The App never receives your card details. Entitlement is checked on the device with StoreKit only."),
                ("Contact", "For anything about the App or this policy, write to t.maks.ts@gmail.com."),
            ],
        },
    }
}


def js_string(value):
    return json.dumps(value, ensure_ascii=False)


out = []
out.append("/**")
out.append(" * FLIP 10 — 12言語のUI文言（Build 2）")
out.append(" *")
out.append(" * index.html の `data-i18n` / `data-i18n-aria` / `data-i18n-title` を")
out.append(" * applyI18n() が埋める。数字（スコアなど）は Intl.NumberFormat で言語ごとに整える。")
out.append(" *")
out.append(" * キーはすべての言語に同じだけ入っている（test/build2.test.js が確かめる）。")
out.append(" * プライバシーポリシーの全文だけは日本語と英語を持ち、ほかの言語では英語を出す。")
out.append(" */")
out.append("")
out.append("export const LOCALES = Object.freeze([")
for lid, label, tag in LOCALES:
    out.append("  Object.freeze({ id: %s, label: %s, tag: %s })," % (js_string(lid), js_string(label), js_string(tag)))
out.append("]);")
out.append("")
out.append("export const DEFAULT_LOCALE = 'ja';")
out.append("export const FALLBACK_LOCALE = 'en';")
out.append("")
out.append("""export function localeMeta(id) {
  return LOCALES.find((locale) => locale.id === id) ?? LOCALES[0];
}

export function isLocale(id) {
  return LOCALES.some((locale) => locale.id === id);
}

export function detectLocale(tag = '') {
  const raw = String(tag || '').toLowerCase();
  if (!raw) return FALLBACK_LOCALE;
  if (raw.startsWith('ja')) return 'ja';
  if (raw.startsWith('ko')) return 'ko';
  if (raw.startsWith('zh-hant') || raw.startsWith('zh-tw') || raw.startsWith('zh-hk')) return 'zh-Hant';
  if (raw.startsWith('zh')) return 'zh-Hans';
  if (raw.startsWith('es')) return 'es';
  if (raw.startsWith('fr')) return 'fr';
  if (raw.startsWith('de')) return 'de';
  if (raw.startsWith('pt')) return 'pt';
  if (raw.startsWith('it')) return 'it';
  if (raw.startsWith('hi')) return 'hi';
  if (raw.startsWith('id') || raw.startsWith('in-')) return 'id';
  return FALLBACK_LOCALE;
}
""")

for index, (lid, _label, _tag) in enumerate(LOCALES):
    var = "ja" if lid == "ja" else ("zhHans" if lid == "zh-Hans" else ("zhHant" if lid == "zh-Hant" else lid))
    out.append("const %s = {" % var)
    for name, values in ROWS:
        out.append("  %s: %s," % (js_string(name), js_string(values[index])))
    out.append("};")
    out.append("")

out.append("export const DICT = Object.freeze({ ja, en, ko, 'zh-Hans': zhHans, 'zh-Hant': zhHant, es, fr, de, pt, it, hi, id });")
out.append("")
out.append("/** 全キー（テストが12言語ぶん揃っているか確かめる） */")
out.append("export const KEYS = Object.freeze(Object.keys(ja));")
out.append("")

prose = PRESENTATION["privacy"]
out.append("/**")
out.append(" * プライバシーポリシー全文。日本語と英語だけが正で、ほかの言語は英語を出す。")
out.append(" * アプリは完全オフライン・1人プレイ・記録は端末内だけ、が要点。")
out.append(" */")
out.append("export const PROSE = Object.freeze({")
out.append("  privacy: Object.freeze({")
for lid in ["ja", "en"]:
    body = prose[lid]
    out.append("    %s: Object.freeze({" % lid)
    out.append("      intro: %s," % js_string(body["intro"]))
    out.append("      sections: Object.freeze([")
    for title, text in body["sections"]:
        out.append("        Object.freeze({ title: %s, body: %s })," % (js_string(title), js_string(text)))
    out.append("      ]),")
    out.append("    }),")
out.append("  }),")
out.append("});")
out.append("""
function interpolate(text, vars) {
  return String(text).replace(/\\{(\\w+)\\}/g, (all, key) => (vars && key in vars ? String(vars[key]) : all));
}

export function t(key, locale = DEFAULT_LOCALE, vars = {}) {
  const table = DICT[locale] ?? DICT[FALLBACK_LOCALE];
  const text = table[key] ?? DICT[DEFAULT_LOCALE][key] ?? key;
  return interpolate(text, vars);
}

/** 全文の言語（ja / en のどちらかを返す） */
export function proseLocale(locale) {
  return locale === 'ja' ? 'ja' : 'en';
}

export function prose(section, locale = DEFAULT_LOCALE) {
  const body = PROSE[section];
  if (!body) return null;
  return body[proseLocale(locale)] ?? body.en;
}

/** ページ内の data-i18n をすべて埋める */
export function applyI18n(root, locale = DEFAULT_LOCALE) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.getAttribute('data-i18n'), locale);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    node.setAttribute('aria-label', t(node.getAttribute('data-i18n-aria'), locale));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((node) => {
    node.setAttribute('title', t(node.getAttribute('data-i18n-title'), locale));
  });
  const meta = localeMeta(locale);
  if (root.documentElement) root.documentElement.setAttribute('lang', meta.tag);
}

export function makeNumberFormat(locale = DEFAULT_LOCALE) {
  const meta = localeMeta(locale);
  try {
    return new Intl.NumberFormat(meta.tag);
  } catch {
    return new Intl.NumberFormat(FALLBACK_LOCALE);
  }
}
""")

with open("src/i18n.js", "w", encoding="utf-8") as handle:
    handle.write("\n".join(out))

print("keys", len(ROWS))
