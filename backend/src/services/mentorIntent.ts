// Intent detection internals. Public imports should use ./mentorIntent.
export type MentorIntent =
  | "almost_code"
  | "casual"
  | "editor_inspection"
  | "meta"
  | "runtime"
  | "solution"
  | "mentor";

export type MentorContextScope = "chat" | "concept" | "assignment" | "editor" | "runtime" | "code";
export type MentorHistoryScope = "none" | "user" | "full";

export type MentorTurnResolution = {
  latestIntent: MentorIntent;
  effectiveIntent: MentorIntent;
  isFollowUp: boolean;
  followUpKind: "ambiguous" | "format_reference" | "line_reference" | "source_check" | "repeat_check" | null;
  isAssignmentTranslationRequest: boolean;
  previousUserQuestion: string | null;
  previousMentorReply: string | null;
};

export type MentorTurnHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim();
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

//done
const TERMINAL_ENGLISH_PATTERNS = [
  /\bwhat\s+(do\s+you\s+see|is|is\s+written|is\s+on)\b.\b(terminal|console|output|stdout|stderr)\b/i,
  /\b(terminal|console)\b.\b(output|stdout|stderr|error|compile|show|see|visible|print|display|log|text)\b/i,
  /\b(output|stdout|stderr|error|compile|compilation|execution|runtime|run)\b.\b(terminal|console)\b/i,
  /\b(terminal|console)\b.\b(idle|status|prove|proof|black box|exact text|silence|empty|clear|blank)\b/i,
  /\b(idle|stdout|stderr|compile output|program actually run|never pressed run|did it run|crash|exit code)\b/i,
  /\b(can you|please|show me|check|read|get|copy)\b.*\b(terminal|console|stdout|stderr|output)\b/i
];

//done
const TERMINAL_TURKISH_PATTERNS = [
  /\b(terminalde|terminaldeki|konsolda|konsoldaki)\b.\b(ne\s+(görüyorsun|goruyorsun|var|yazıyor|yaziyor)|görünüyor|gorunuyor|hata|çıktı|cikti|derleme|metin)\b/i,
  /\b(terminal|konsol)\b.\b(çıktısı|ciktisi|sonucu|hatası|atasi|durumu|ekranı|ekrani|raporu)\b/i,
  /\b(terminal|stdout|stderr|derleme|compile|calistirdim|çalıştırdım|calismamis|çalışmamış|idle|çalışma|calisma)\b.*\b(durum|kanıt|kanit|hata|sessiz|boş|bos|yazı|yazi|kod)\b/i,
  /\b(ekrana\s+ne\s+bastı|ekrana\s+ne\s+basti|ne\s+yazdı|ne\s+yazdi|ne\s+çıktı|ne\s+cikti)\b/i,
  /\b(çalışma\s+zamanı|calisma\s+zamani|çalışma\s+durumu|calisma\s+durumu|derleme\s+hatası|derleme\s+hatasi|loglar|logları|loglari)\b/i
];

//done
const TERMINAL_OR_CONSOLE_PATTERNS = [
  ...TERMINAL_ENGLISH_PATTERNS,
  ...TERMINAL_TURKISH_PATTERNS,
];

//done
const ERROR_OR_EXECUTION_PATTERNS = [
  /\b(what is the output|what does it print|what does it show|what is the result)\b/i,
  /\b(did it pass|did it run|did it work|is it working|passed|failed|fail|success)\b/i,
  /\b(what error|error message|error code|syntax error|type error|link error|warning)\b/i,
  /\b(what does this error mean|what does it mean|explain this error|why this error)\b/i,
  /\b(this error mean|meaning of this error|reason for this error)\b/i,
  /\b(runtime|run-time|execution|compilation|compile|derleme|çalışma zamanı|calisma zamani)\b/i,
  /\b(i have an error|i got an error|getting an error|facing an error|thrown an error)\b/i,
  /\b(take a look at the error|look at the error|check the error|see the error)\b/i,
  /\b(exception|traceback|stderr|stdout|stack overflow|segfault|segmentation fault|memory leak)\b/i,
  /\b(why am i getting|why do i get|why does it happen|how to fix this|how do i fix)\b/i,
  /\b(çıktı|cikti|çıktısı|ciktisi|sonuç|sonuc|ne yazdırır|ne yazdirir|ekrana ne basar)\b/i,
  /\b(hata|hata mesajı|hata mesaji|hata kodu|kod hatası|kod hatasi|uyarı|uyari|istisna)\b/i,
  /\b(neden alıyorum|neden aliyorum|neden verdi|niye hata aldım|niye hata aldim|sebebi ne|sebebi nedir)\b/i,
  /\b(çöktü|cokti|çalışmadı|calismadi|patladı|patladi|hata veriyor|hata verdi|error veriyor)\b/i
];

const EXPECTED_OUTPUT_OR_FORMAT_PATTERNS = [
  /\b(expected\s+output|terminal\s+output|console\s+output|sample\s+output|program\s+output)\b/i,
  /\b(test\s+case|test\s+cases|input\s+output\s+examples?|io\s+example)\b/i,
  /\b(what\s+should\s+it\s+print|what\s+does\s+it\s+print|what\s+is\s+the\s+output)\b/i,
  /\b(format\s+the\s+output|output\s+format|string\s+format|print\s+format)\b/i,
  /\b(in\s+json\s+format|as\s+a\s+table|markdown\s+table|plain\s+text\s+only)\b/i,
  /\b(beklenen\s+çıktı|beklenen\s+cikti|ekran\s+çıktısı|ekran\s+ciktisi|terminal\s+çıktısı|terminal\s+ciktisi|konsol\s+çıktısı|konsol\s+ciktisi)\b/i,
  /\b(örnek\s+çıktı|ornek\s+cikti|kodun\s+çıktısı|kodun\s+ciktisi|programın\s+çıktısı|programin\s+ciktisi)\b/i,
  /\b(ne\s+yazdırmalı|ne\s+yazdirmali|ne\s+basacak|ekrana\s+ne\s+gelmeli|çıktı\s+ne\s+olmalı|cikti\s+ne\s+olmali)\b/i,
  /\b(test\s+case|test\s+caseleri|test\s+senaryoları|test\s+senaryolari|girdi\s+çıktı\s+örnekleri|girdi\s+cikti\s+ornekleri)\b/i,
  /\b(çıktı\s+formatı|cikti\s+formati|yazdırma\s+formatı|yazdırma\s+formati|string\s+formatı|string\s+formati)\b/i,
  /\b(json\s+formatında|json\s+formatinda|tablo\s+olarak|tablo\s+halinde|liste\s+halinde|sadece\s+metin\s+olarak)\b/i,
  /\b(çıktıyı\s+göster|cıktıyı\s+ver|çıktısını\s+yaz|ciktisini\s+yaz|nasıl\s+bir\s+çıktı|nasil\s+bir\s+cikti)\b/i
];

//done
const FAILURE_OR_NO_OUTPUT_PATTERNS = [
  /\bwhy\b.\b(output|wrong|fail|fails|failing|failed|test case|print nothing|prints nothing|doesn'?t print|does not print|blank|empty|infinite loop)\b/i,
  /\bwhy does it print nothing\b/i,
  /\bwhy is my output (wrong|incorrect|unexpected|empty|blank|garbage)\b/i,
  /\bwhy does it (fail|crash|stop|freeze|hang)\b/i,
  /\b(can you )?help me (debug|fix|resolve|trace|troubleshoot)\b/i,
  /\b(debug|fix|patch|refactor) (this|my code|this function|this error)\b/i,
  /\b(wrong|incorrect|invalid|bad|unexpected|empty) output\b/i,
  /\b(no|zero|blank|empty|missing) output\b/i,
  /\b(test case|test suite|unit test) (failed|fails|failing|is broken)\b/i,
  /\bneden\b.\b(yazdırmıyor|yazdirmiyor|basmıyor|basmiyor|yanlış|yanlis|geçmiyor|gecmiyor|kalıyor|kaliyor|hata|çöküyor|cokuyor|patlıyor|patliyor)\b/i,
  /\b(çıktım|çıktı|ciktim|cikti|sonuç|sonuc) neden (yanlış|yanlis|hatalı|hatali|farklı|farkli|boş|bos)\b/i,
  /\b(bu )?(test case|test|senaryo) neden (geçmiyor|gecmiyor|kalıyor|kaliyor|patlıyor|patliyor|başarısız|basarisiz)\b/i,
  /\bneden (hiçbir şey|hicbir sey|hiçbişey|hicbisey) (yazdırmıyor|yazdirmiyor|basmıyor|basmiyor|dönmüyor|donmuyor|çıkmıyor|cikmıyor)\b/i,
  /\b(kodumu|kodu|hatayı|hatayi) (ayıklayabilir misin|ayiklayabilir misin|düzeltebilir misin|duzeltebilir misin|çözebilir misiniz|cozebilir misiniz|birlikte bakalım mı)\b/i,
  /\b(sonsuz döngüye|sonsuz donguye) (giriyor|girdi|giriş yaptı|takıldı|takildi)\b/i
];

//done
const EDITOR_VISIBILITY_ENGLISH_PATTERNS = [
  /\b(do|can|could|are)\s+you\s+(see|seeing|look|looking|read|reading)\b/i,
  /\bare you able to see\b.\b(current|my|the)?\s(code|editor|file|screen|tab|workspace)\b/i,
  /\bis\s+(there|this|that|it)\b.\b(visible|shown|provided|included|present|in (my|the) (editor|code|context|file|window))\b/i,
  /\b(is|are)\b.\b(visible|hidden|empty|blank|loaded|showing|open)\b/i,
  /\b(what do you see|what is visible|what code do you have|copy visible code|list visible lines)\b/i,
  /\b(can you look at|look at my|check out my)\s+(code|editor|file|script)\b/i
];

//done
const EDITOR_VISIBILITY_TURKISH_PATTERNS = [
  /\b(görüyor musun|goruyor musun|görünüyor mu|gorunuyor mu|görebiliyor musun|gorebiliyor musun|okuyabiliyor musun|okuyabiliyor musun)\b/i,
  /\b(editor|editör|editörü|editoru|kod|code|satır|satir|line|dosya|ekran|sekme)\b.\b(var mı|var mi|görünüyor mu|gorunuyor mu|görüyor musun|goruyor musun|açık mı|acik mi|boş mu|bos mu)\b/i,
  /\b(print|printf|cout|console.log|output|loop|function|condition|recursion|array|list|variable|include)\b.\b(var mı|var mi|görünüyor mu|gorunuyor mu|görüyor musun|goruyor musun|ekli mi)\b/i,
  /\b(kodumda|kodda|editörde|editorde|çıktıda|ciktida|yazdırmada|yazdirmada|döngüde|dongude|fonksiyonda|koşulda|kosulda|bende)\b.*\b(var mı|var mi|görünüyor mu|gorunuyor mu|görüyor musun|goruyor musun)\b/i,
  /\b(ekranda ne var|editörde ne var|editorde ne var|kodumda ne görüyorsun|kodumda ne goruyorsun|gördüğün kodu yaz|gordugun kodu yaz)\b/i,
  /\b(imleç nerede|imlec nerede|imleç civarında|imlec civarinda|hangi satır|hangi satir|aktif dosya)\b/i
];

//done
const EDITOR_VISIBILITY_PATTERNS = [
...EDITOR_VISIBILITY_ENGLISH_PATTERNS,
...EDITOR_VISIBILITY_TURKISH_PATTERNS,
];
//done
const EDITOR_COPY_REQUEST_PATTERNS = [
  /\b(what do you see in my (editor|code)|can you see what is in my (editor|code))\b/i,
  /\b(can you write what you see|write what you see in the editor|write the editor text exactly)\b/i,
  /\b(copy|print|show|repeat|dump|output|get|extract|read)\b.\b(visible|current|open|editor|screen|active)\b.\b(code|text|lines|file|content)\b/i,
  /\b(repeat the code visible|copy visible code only|print the visible code|show the visible code)\b/i,
  /\b(line numbers with visible code|list only the visible lines|just list the editor lines|enumerate visible lines)\b/i,
  /\bdo not diagnose.list\b/i,
  /\b(just|only|exactly|literally|raw)\b.\b(copy|list|print|show|repeat|write|text|code)\b/i,
  /\b(editörde|editorde|kodumda|kodda|ekranda)\b.\b(ne\s+(görüyorsun|goruyorsun|var|yazıyor|yaziyor)|gördüklerini\s+(yaz|listele|kopyala|bas))\b/i,
  /\b(gördüğün|gordugun|görünen|gorunen)\b.\b(kodu|kodları|kodlari|metni|satırları|satirlari)\b.\b(aynen|birebir|harfi harfine|raw|numaralandırarak|numaralandirarak)\b.\b(yaz|aktar|kopyala|listele|bas)\b/i,
  /\b(sadece\s+görüneni\s+söyle|sadece\s+goruneni\s+soyle|sadece\s+görünen\s+satırları\s+numaralandır|sadece\s+gorunen\s+satirlari\s+numaralandir)\b/i,
  /\b(editörün|editorun|dosyanın|dosyanin|ekranın|ekranin)\b.\b(içeriğini|icerigini|tamamını|tamamini|tümünü|tumunu)\b.\b(yazdır|yazdir|kopyala|bas|oku|listele)\b/i,
  /\b(analiz\s+etmeden|yorum\s+yapmadan|çözüm\s+önermeden|cozum\s+onermeden)\b.*\b(kodu\s+yaz|kodu\s+listele|aynen\s+aktar)\b/i
];

const EDITOR_STATE_CHECK_PATTERNS = [
  /\b(what is on the cursor neighborhood|cursor neighborhood|cursor context|near the cursor|around the cursor)\b/i,
  /\b(what else do you see|what else is in my code|what else is visible|anything else)\b/i,
  /\b(what do you see now|what is visible now|look again|check again|re-examine)\b/i,
  /\b(is it still the same code|did anything change in my editor|has the code changed|is it updated)\b/i,
  /\b(check the visible code again|are you still seeing only those lines|are those lines still there)\b/i,
  /\b(active file empty|editor is blank|empty file|nothing open|file is clear)\b/i,
  /\b(literally visible|actually visible|exactly open|raw context)\b/i,
  /\b(code after the comment|after the comment|below the comment|following the comment)\b/i,
  /\b(closing brace visible|bracket visible|curly brace open|is the brace closed)\b/i,
  /\b(visible file contain|visible code|visible lines|visible area|viewport content)\b/i,
  /\b(imleç civarında|imlec civarinda|imleç nerede|cursor nerede|imlecin etrafında|imlecin etrafinda)\b/i,
  /\b(başka ne görüyorsun|baska ne goruyorsun|başka bir şey var mı|baska bir sey var mi|kodda başka ne var)\b/i,
  /\b(şimdi ne görüyorsun|simdi ne goruyorsun|şu an ne açık|su an ne acik|tekrar bakar mısın|tekrar bakar misin)\b/i,
  /\b(aynı kodu mu görüyorsun|ayni kodu mu goruyorsun|kod değişmiş mi|kod degismis mi|değişiklik var mı|degisiklik var mi)\b/i,
  /\b(hala sadece bu satırlar mı var|hala sadece bu satirlar mi var|sadece bu kadar mı|sadece bu kadar mi)\b/i,
  /\b(aktif dosya boş mu|aktif dosya bos mu|editör boş|editor bos|boş editör|bos editor)\b/i,
  /\b(yorum satırından sonra|yorum satirindan sonra|yorumdan sonra|açıklamadan sonra|aciklamadan sonra)\b/i,
  /\b(kapanış süslü|kapanis suslu|süslü parantez|suslu parantez|parantez görünüyor mu|parantez gorunuyor mu)\b/i
];

// Bu liste; kullanıcının editördeki görünür kod satırlarını, dosya içeriğini veya belirli satır numaralarını yapay zeka mentöründen analiz veya yorum yapmaksızın ham şekilde aynen kopyalamasını, listelemesini veya tekrarlamasını talep eden Türkçe komut kalıplarını yakalamak için tasarlanmıştır. "Nedir/Nasıl" gibi akademik soruları yakalamaması için negatif filtreler (lookahead) içerir.
const EDITOR_TURKISH_COPY_REQUEST_PATTERNS = [
  /\b(editör|editor|kod|code)\b\s+ne\s+(?!(nedir|işe yarar|anlama gelir|yapar|demek))\w+/i,
  /\b(editorde gordugun her satiri yaz|editörde gördüğün her satırı yaz)\b/i,
  /\b(sadece gorunen satirlari numaralandir|sadece görünen satırları numaralandır)\b/i,
  /\b(kodu aynen aktar|kodu direkt kopyala|kodları olduğu gibi yaz|kodlari oldugu gibi yaz)\b/i,
  /\b(sadece\s+görünen\s+satırları\s+listele|sadece\s+gorunen\s+satirlari\s+listele)\b/i,
  /\b(analiz\s+etmeden|yorum\s+yapmadan|çözüm\s+önermeden|cozum\s+onermeden)\b.*\b(metni\s+kopyala)\b/i,
  /\b(kod satırlarını bas|kod satirlarini bas|satır satır yazdır|satir satir yazdir|birebir kopyasını ver)\b/i
];

const EDITOR_TURKISH_STATE_CHECK_PATTERNS = [
  /\b(aktif\s+dosya|aktif\s+sekme|açık\s+olan\s+dosya|acik\s+olan\s+dosya|geçerli\s+dosya|gecerli\s+dosya)\b/i,
  /\b(include\s+satırı|include\s+satiri|kütüphane\s+satırı|kutuphane\s+satiri|import\s+satırı|import\s+satiri)\b/i,
  /\b(sadece\s+gördüğünü\s+söyle|sadece\s+gordugunu\s+soyle)\b/i,
  /\b(kodda\s+mı|kodda\s+mi|kod\s+bloğunda\s+mı|kod\s+blogunda\s+mi|kodun\s+içinde\s+mi|kodun\s+icinde\s+mi)\b/i,
  /\b(açıklamada\s+mı|aciklamada\s+mi|yorumda\s+mı|yorumda\s+mi|açıklama\s+satırında\s+mı|aciklama\s+satirinda\s+mi)\b/i,
  /\b(yorum\s+satırı|yorum\s+satiri|açıklama\s+satırı|aciklama\s+satiri|yorum\s+blogu|yorum\s+bloğu)\b/i,
  /\b(kapanış\s+süslü|kapanis\s+suslu|süslü\s+parantez|suslu\s+parantez|kapanış\s+parantezi|kapanis\s+parantezi|bracket)\b/i,
  /\b(yeniden\s+kontrol\s+et|bi\s+daha\s+baksana|yeniden\s+bak)\b/i,
  /\b(ekranda\s+hiçbir\s+şey\s+yok\s+mu|ekranda\s+hicbir\s+sey\s+yok\s+mu)\b/i
];

const EDITOR_INSPECTION_PATTERNS = [
  ...EDITOR_COPY_REQUEST_PATTERNS,
  ...EDITOR_STATE_CHECK_PATTERNS,
  ...EDITOR_TURKISH_COPY_REQUEST_PATTERNS,
  ...EDITOR_TURKISH_STATE_CHECK_PATTERNS,
];

// Bu liste; öğrencilerin kodlarındaki mantıksal hataları bulma, bir sonraki adımı planlama, kod kalitesini artırma (refactoring) veya sorun giderme stratejileri geliştirme aşamalarındaki İngilizce ve Türkçe ifadelerini yakalamak için tasarlanmıştır.
const DEBUG_OR_STRATEGY_PATTERNS = [
  /\b(why|how come|reason for|source of|cause of|why does it|why is my)\b/i,
  /\b(fail|fails|failing|failed|crash|crashed|hang|freeze|stop|broken)\b/i,
  /\b(what should i do|what to do next|how to proceed|what is the next step|where to go from here|what am i doing wrong)\b/i,
  /\b(should i|can i|do i need to|ought i to|is it better to)\b/i,
  /\b(next|next step|upcoming|following|after this|what comes after)\b/i,
  /\b(issue with|problem with|bug in|error in|fault in|trouble with|defect in)\b/i,
  /\b(better way|best practice|alternative approach|cleaner way|more efficient way|optimal way)\b/i,
  /\b(improve|optimization|optimize|refactor|enhance|speed up|clean up|restructure|perfect)\b/i,
  /\b(fix|patch|resolve|solve|repair|mend|correct|debug|debugging|troubleshoot)\b/i,
  /\b(neden|niye|niçin|nicin|neden kaynaklanıyor|neden kaynaklaniyor|sebebi ne|sebebi nedir)\b/i,
  /\b(ne yapmalıyım|ne yapmaliyim|ne yapmam gerekiyor|nasıl ilerlemeliyim|nasil ilerlemeliyim|yol haritası|yol haritasi)\b/i,
  /\b(sonraki|sonraki adım|sonraki adim|bir sonraki|bundan sonra|ardından|ardindan)\b/i,
  /\b(daha iyi|daha temiz|daha hızlı|daha hizli|daha verimli|en mantıklı|en mantikli|en doğru|en dogru)\b/i,
  /\b(düzelt|duzelt|düzeltme|duzeltme|onar|çöz|coz|hata ayıkla|hata ayikla|tamir et|revize et)\b/i,
  /\b(hata|kusur|arıza|ariza|problem|sorun|sıkıntı|sikinti|uyarı|uyari|error|bug|istisna|exception)\b/i,
  /\b(geliştir|gelistir|iyileştir|iyilestir|optimize et|refactor et|hızlandır|hizlandir|sadeleştir|sadelestir)\b/i,
  /\b(taktik|taktik ver|ipucu|ipucu ver|yol göster|yol goster|strateji|yaklaşım|yaklasim)\b/i
];

const SOURCE_ATTRIBUTION_PATTERNS = [
  /\b(from my code|from the assignment|assuming|seeing it|is that from|are you assuming|where did you get|how do you know)\b/i,
  /\b(kodumda mı|kodumda mi|ödevden mi|odevden mi|varsayıyor musun|varsayiyor musun|varsayım mı|varsayim mi|gördüğün mü|gordugun mu|nereden çıkardın|nereden cikardin|nerden bildin)\b/i,
];

const REPEAT_CHECK_PATTERNS = [
  /^(same question|what about now|did anything change|check again|can you check.*again|again??|still??|look again|recheck)/i,
  /^(tekrar bak|bi daha bak|bir daha bak|aynı kod|ayni kod|hala|hâlâ|değişiklik var mı|degisiklik var mi|güncellendi mi|guncellendi mi)/i,
];

const LINE_REFERENCE_PATTERNS = [
  /\b(which line|where exactly|what line|line number|line where|at what line|specific line)\b/i,
  /\b(tam olarak nerede|tam olarak nerde|hangi satır|hangi satir|kaçıncı satır|kacinci satir|satır numarası|satir numarasi|neresi)\b/i,
];

const AMBIGUOUS_FOLLOW_UP_PATTERNS = [
  /^(why|why?|how?|neden|neden?|niye|niye?|niçin|nicin?)\b/i,
  /^(what do you mean|ne demek istedin|ne demek|anlamı ne|anlami ne|ne alaka|ne demek oluyor)\b/i,
  /^(can you explain that again|say it simpler|make it simple|daha basit|daha net|anlamadım|anlamadim|i don'?t understand|i'm lost)\b/i,
];

const FORMAT_REFERENCE_FOLLOW_UP_PATTERNS = [
  /^(in\s+)?(c|c\+\+|cpp|csharp|cs|python|py|java|javascript|js|ts|typescript|kotlin|swift|ruby|php|go|golang|rust|scala|lua|r|bash|shell|html|css|sql)\s*(language|version)??$/i,
  /^(c|c\+\+|cpp|csharp|cs|python|py|java|javascript|js|ts|typescript|kotlin|swift|ruby|php|go|golang|rust|scala|lua|r|bash|shell|html|css|sql)\s*'?d[ae]\??$/i,
  /^(c|c\+\+|cpp|csharp|cs|python|py|java|javascript|js|ts|typescript|kotlin|swift|ruby|php|go|golang|rust|scala|lua|r|bash|shell|html|css|sql)\s+(de|da|ile|olarak|dilinde|halinde|türünde|turunde)??$/i,
  /^(bunu|şunu|sunu|onu|kodları|kodlari)\s+(in\s+)?(c|c\+\+|cpp|csharp|cs|python|py|java|javascript|js|ts|typescript|kotlin|swift|ruby|php|go|golang|rust|scala|lua|r|bash|shell|html|css|sql)\s*(de|da|ile|olarak|dilinde|halinde|türünde|turunde)?\s*(göster|goster|yaz|anlat|çevir|cevir|dönüştür|donustur)\??$/i,
];

const CONVERSATION_MEMORY_PATTERNS = [
  /\b(last\s+\d+\s+questions?|previous\s+\d+\s+questions?|past\s+\d+\s+questions?)\b/i,
  /\bwhat\s+was\s+my\s+(last|first|previous|prior)\s+(question|message|prompt|ask)\b/i,
  /\bwhat\s+were\s+my\s+(last|previous|past)\s+(few\s+questions|messages|prompts)\b/i,
  /\b(what\s+did\s+i\s+ask|what\s+i\s+asked|what\s+was\s+i\s+asking|what\s+did\s+i\s+just\s+say)\b/i,
  /\b(first\s+thing\s+i\s+asked|my\s+very\s+first\s+question|how\s+did\s+we\s+start)\b/i,
  /\b(remember\s+what\s+i\s+asked|do\s+you\s+remember\s+my\s+question)\b/i,
  /\bson\s+\d+\s+(soru|sorumu|mesaj|mesajımı|girdi|girdimi)\b/i,
  /\bson\s+(iki|üç|uc|dört|dort|beş|bes|birkaç|birkac)\s+(soru|sorumu|mesaj|mesajımı)\b/i,
  /\b(ilk\s+soru|ilk\s+sorumu|ilk\s+mesaj|ilk\s+mesajımı|başlangıçtaki\s+soru|baslangictaki\s+soru)\b/i,
  /\b(ilk\s+sorduğum|ilk\s+sordugum|ilk\s+ne\s+sordum|en\s+başta\s+ne\s+sordum|en\s+basta\s+ne\s+sordum)\b/i,
  /\b(sana\s+sorduğum|sana\s+sordugum|sorduğum\s+sorular|sordugum\s+sorular|geçmiş\s+sorularım|gecmis\s+sorularim)\b/i,
  /\b(az\s+önce\s+ne\s+sordum|az\s+once\s+ne\s+sordum|demin\s+ne\s+sordum|az\s+önce\s+ne\s+dedim|az\s+once\s+ne\s+dedim)\b/i,
  /\b(nelerden\s+bahsettik|ne\s+konuştuk|ne\s+konustuk|konuşmamızı\s+hatırlıyor\s+musun|konusmamizi\s+hatirliyor\s+musun)\b/i
];

const META_PATTERNS = [
  /\b(what'?s\s+your\s+model|what\s+is\s+your\s+model|what\s+model|which\s+model|model\s+are\s+you\s+using)\b/i,
  /\b(your\s+ai\s+model|which\s+ai|what\s+engine\s+is\s+under\s+your\s+hood|what\s+architecture|ollama|gemma|qwen)\b/i,
  /\b(what\s+can\s+you\s+do|what\s+kind\s+of\s+help\s+can\s+you\s+give|how\s+can\s+you\s+help|what\s+is\s+your\s+purpose)\b/i,
  /\b(can\s+you\s+explain\s+things\s+step\s+by\s+step|explain\s+how\s+you\s+work|how\s+do\s+you\s+operate)\b/i,
  /\b(who\s+are\s+you|are\s+you\s+an\s+ai\s+mentor|coding\s+assistant|software\s+mentor|technical\s+coach)\b/i,
  /\b(your\s+boundaries|normal\s+mentor|policy\s+document|code\s+vending\s+machine|taking\s+over\s+my\s+keyboard)\b/i,
  /\b(what'?s\s+your\s+name|what\s+is\s+your\s+name|do\s+you\s+have\s+a\s+name|your\s+name)\b/i,
  /\b(how\s+old\s+are\s+you|what\s+age\s+are\s+you|when\s+were\s+you\s+created|your\s+release\s+date)\b/i,
  /\b(how\s+much\s+do\s+you\s+know\s+english|how\s+good\s+is\s+your\s+english|do\s+you\s+know\s+english|speak\s+english)\b/i,
  /\b(modelin\s+ne|modelin\s+nedir|model\s+ad[ıi]n[ıi]|model\s+ismin|hangi\s+model|altyapın\s+ne|altyapin\s+ne)\b/i,
  /\b(ad[ıi]n\s+ne|ismin\s+ne|ismin\s+var\s+mı|ismin\s+var\s+mi|adın\s+nedir|ismin\s+nedir|adın\s+var\s+mı|adin\s+var\s+mi)\b/i,
  /\b(kaç\s+yaşındasın|kac\s+yasindasin|yaşın\s+kaç|yasin\s+kac|ne\s+zaman\s+yapıldın|ne\s+zaman\s+yapildin)\b/i,
  /\b(ingilizce\s+biliyor\s+musun|ingilizcen\s+nasıl|ingilizcen\s+nasil|ne\s+kadar\s+ingilizce|ingilizce\s+anlar\s+mısın|ingilizce\s+anlar\s+misin)\b/i,
  /\b(kimsin|necisin|nesin|sen\s+kimsin|yapay\s+zeka\s+mısın|yapay\s+zeka\s+misin|bot\s+musun)\b/i,
  /\b(ne\s+yapabilirsin|nasil\s+yardim\s+edersin|nasıl\s+yardım\s+edersin|görevin\s+ne|gorevin\s+ne|amacın\s+ne|amacin\s+ne)\b/i,
  /\b(yardim\s+eder\s+misin|yardım\s+eder\s+misin|rehberlik\s+eder\s+misin|destek\s+olur\s+musun)\b/i,
  /\b(kodla\s+bogmadan|kodla\s+boğmadan|kod\s+vermeden|sokratik|sokrat\s+yöntemi)\b/i,
  /\b(terminal\s+çıktısını\s+da\s+dikkate\s+alabiliyor\s+musun|terminal\s+ciktisini\s+da\s+dikkate\s+alabiliyor\s+musun)\b/i,
  /\b(sohbet\s+mi|kod\s+sorusu\s+mu|genel\s+muhabbet|geyik\s+mi)\b/i,
  /\b(sinirlarin|sınırların|sınırın|sinirin|kuralların|kurallarin|neye\s+iznin\s+var)\b/i,
  /\b(cevap\s+makinesi|kod\s+makinesi|yapay\s+zeka\s+mentor|yapay\s+zeka\s+mentör|ai\s+mentor)\b/i
];

const CASUAL_PATTERNS = [
  /^(hi|hello|hey|yo|sup|greetings|good\s+(morning|afternoon|evening))\b/i,
  /^(merhaba|selam|slm|hey|naber|ne\s+haber|mrb|selamlar|tünaydın|gunaydin|günaydın)\b/i,
  /^(how\s+are\s+you|how'?s\s+it\s+going|what'?s\s+up|how\s+are\s+things|how\s+do\s+you\s+do)??$/i,
  /\b(how\s+are\s+you|how\s+you\s+doing|nasılsın|nasilsin|keyifler\s+nasıl|keyifler\s+nasil)\b/i,
  /\b(naber|ne\s+haber|ne\s+var\s+ne\s+yok|neler\s+yapıyorsun|neler\s+yapiyorsun)\b/i,
  /\bi'?m\s+(good|fine|okay|ok|great|doing\s+well|doing\s+good)\b/i,
  /\b(thanks|thank\s+you|cheers|much\s+appreciated)\b/i,
  /^(tamam|tamamdır|tamamdir|tmm|okey|ok|olur|peki|anladım|anladim|aynen|evet|hayır|hayir|kesinlikle|hadi\s+bakalım|hadi\s+bakalim)[.!?]*$/i,
  /\b(teşekkür|tesekkur|teşekkürler|tesekkurler|tsk|eyvallah|sağ\s+ol|sag\s+ol|sağolasın|sagolasin|rica\s+ederim)\b/i,
  /\b(iyi\s+günler|iyi\s+gunler|iyi\s+akşamlar|iyi\s+aksamlar|iyi\s+geceler|görüşürüz|gorusuruz|bay\s+bay|bye\s+bye)\b/i
];

const BASIC_HELP_ENGLISH_PATTERNS = [
  /\bhow\s+(do\s+i|can\s+i)\s+(read|take|get|accept)\b.\b(input|string|char|line|number|integer|int|float)\b/i,
  /\bwhat\s+does\b.\b(mean|do|represent|signify|stand\s+for)\b/i,
  /\bwhat'?(is|s)\s+(a|an|the)?\s*(string|integer|int|float|double|char|boolean|bool|variable|array|list|vector|loop|function|method|condition|if\s+statement|pointer|reference|class|object|struct)\b/i,
  /\b(show|give|write|provide|print)\b.\b(example|sample|snippet|template|demo)\b/i,
  /\b(example|sample|snippet)\b.\b(in|using|for|with)\s+(c|c\+\+|cpp|csharp|cs|python|py|java|javascript|js|ts|typescript|go|rust|html|css|sql)\b/i,
  /\bhow\s+does\b.\b(work|operate|execute|run)\b/i,
  /\bwhat\s+is\s+the\s+syntax\s+(for|of|to)\b/i,
  /\bhow\s+(do\s+i|can\s+i)\s+(loop|iterate|traverse|repeat|while|for\s+each)\b/i,
  /\bhow\s+(do\s+i|can\s+i)\s+(convert|cast|parse|transform|change)\b.\bto\b.\b(int|integer|float|string|double|char)\b/i,
  /\bhow\s+(do\s+i|can\s+i)\s+(declare|initialize|define|create|instantiate|allocate)\b/i,
  /\bhow\s+(do\s+i|can\s+i)\s+(print|display|show|output)\b.\b(on\s+screen|to\s+console|text|value)\b/i,
  /\b(explain|break\s+down|teach\s+me|help\s+me\s+understand)\b.*\b(concept|syntax|logic|basics|fundamentals)\b/i
];

const BASIC_HELP_TURKISH_PATTERNS = [
  /\bhow\s+(do\s+i|can\s+i)\s+(read|take|get)\b/i, // İngilizce kalıp kazara buraya eklenmişse diye esneklik (veya kaldırılabilir)
  /\bnasıl\b.\b(okunur|okurum|alınır|alinir|alırım|alirim|girdi|input)\b/i,
  /\b(iki|birden\s+fazla)\s+(string|ifade|kelime|sayı|sayi)\b.\bnasıl\s+(okunur|okunur??|alınır|alinir)\b/i,
  /\bne\s+anlama\s+(geliyor|gelir|gelmektedir|demek|ifade\s+ediyor)\b/i,
  /\b(string|integer|int|float|double|char|boolean|bool|değişken|degisken|dizi|array|liste|list|döngü|dongu|loop|fonksiyon|function|method|koşul|kosul|if\s+bloğu|if\s+blogu|pointer|işaretçi|isaretci|class|nesne|struct|kütüphane|kutuphane)\s+(nedir|ne\s+demek|neye\s+denir)\b/i,
  /\b(kod\s+)?(örneği|ornegi|örnek|ornek|snippet|şablon|sablon)\b.\b(göster|goster|ver|yaz|paylaş|paylas|atabilir\s+misin)\b/i,
  /\b(c|c\+\+|cpp|csharp|cs|python|py|java|javascript|js|ts|typescript|go|rust|html|css|sql)\b.\b(de|da|ile|olarak|dilinde|türünde|turunde)\b.\b(göster|goster|örnek|ornek|yaz|kod)\b/i,
  /\bne\s+(yapar|işe\s+yarar|ise\s+yarar|çıktı\s+verir|cikti\s+verir|görev görür|gorev\s+gorur)\b/i,
  /\bnasıl\s+(çalışır|calisir|işler|isler|çalışıyor|calisiyor|yürütülür|yurutulur)\b/i,
  /\b(sözdizimi|sozdizimi|söz\s+dizimi|soz\s+dizimi|syntax|yazım\s+kuralı|yazim\s+kurali)\b/i,
  /\bnasıl\b.\b(döngü|dongu|loop|for|while|dönebilirim|donebilirim|gezerim|iterate\s+ederim)\b/i,
  /\bnasıl\b.*\b(declare|tanımlanır|tanimlanir|tanımlarım|tanimlarim|oluşturulur|olusturulur|ilklendirilir|initialize\s+edilir)\b/i,
  /\b(ekrana\s+nasıl\s+yazdırırım|ekrana\s+nasil\s+yazdirmirim|nasıl\s+ekrana\s+basarım|nasil\s+ekrana\s+basarim|printf|cout|print)\b/i,
  /\b(temel\s+mantığı|temel\s+mantigi|anlatabilir\s+misin|yardımcı\s+olur\s+musun|yol\s+göster|yol\s+goster)\b/i
];

const BASIC_HELP_PATTERNS = [
  ...BASIC_HELP_ENGLISH_PATTERNS,
  ...BASIC_HELP_TURKISH_PATTERNS,
];

const ALMOST_CODE_ENGLISH_PATTERNS = [
  /\b(pseudocode|pseudo-code|mock\s+code|logic\s+outline)\b/i,
  /\b(template|skeleton|boilerplate|scaffold|scaffolding)\b/i,
  /\b(partial\s+example|incomplete\s+snippet|half\s+code|code\s+outline)\b/i,
  /\b(next\s+two\s+lines|next\s+few\s+lines|what\s+comes\s+next\s+code|fill\s+in\s+the\s+blanks)\b/i,
  /\b(only\s+the\s+condition|just\s+the\s+if|only\s+the\s+loop\s+structure|just\s+the\s+loop\s+head)\b/i,
  /\bfunction\s+structure\b.{0,80}\b(leave\s+blanks|empty|todo|placeholder)\b/i,
  /\b(core\s+idea|logic|algorithm|strategy)\s+as\s+(comments?|documentation)\b/i,
  /\b(write|show|give|provide)\b.{0,80}\b(comments?|pseudo|steps\s+only)\b/i,
  /\b(do\s+not\s+give\s+full\s+code|without\s+giving\s+the\s+full|just\s+a\s+hint\s+of\s+code)\b/i,
];

const ALMOST_CODE_TURKISH_PATTERNS = [
/\b(psödo|psödokod|pseudocode|pseudo-code|sözde\s+kod|sozde\s+kod|algoritma\s+adımları|algoritma\s+adimlari)\b/i,
/\b(sadece\s+iskelet|kod\s+iskeleti|taslak\s+kod|kod\s+taslağı|kod\s+taslagi|şablon|sablon|boilerplate)\b/i,
/\b(boşluklu\s+taslak|bosluklu\s+taslak|içini\s+boş\s+bırak|icini\s+bos\s+birak|noktalı\s+yerler|noktali\s+yerler)\b/i,
/\b(sadece\s+koşul|sadece\s+kosul|sadece\s+if\s+kısmı|sadece\s+if\s+kismi|koşul\s+bloğu|kosul\s+blogu)\b/i,
/\b(sadece\s+döngü\s+(yapısı|iskeleti)|sadece\s+dongu\s+(yapisi|iskeleti)|döngü\s+gövdesi|dongu\s+govdesi|for\s+bloğu|for\s+blogu)\b/i,
/\b(yarım\s+bırak|yarim\s+birak|devamını\s+boşluk\s+yap|devamini\s+bosluk\s+yap|sadece\s+başlangıç|sadece\s+baslangic)\b/i,
/\b(yorum\s+satırı\s+olarak|yorum\s+satiri\s+olarak|açıklama\s+satırlarıyla|aciklama\s+satirlariyla|mantığı\s+anlat)\b.*\bkod\b/i,
/\b(tam\s+kod\s+verme|kodun\s+hepsini\s+yazma|kodun\s+tamamını\s+istiyorum|kodun\s+tamamini\s+istiyorum|sadece\s+ipucu)\b/i,
/\b(fonksiyon\s+imzası|fonksiyon\s+imzasi|prototip|gövdesiz\s+fonksiyon|govdesiz\s+fonksiyon)\b/i
];

const ALMOST_CODE_PATTERNS = [
  ...ALMOST_CODE_ENGLISH_PATTERNS,
  ...ALMOST_CODE_TURKISH_PATTERNS,
];

const CURRENT_CODE_CONTEXT_PATTERNS = [
/\b(current|my|here|this\s+line|this\s+code|these\s+lines|these\s+variables)\b/i,
/\b(in\s+my\s+code|in\s+the\s+code|in\s+this\s+problem|for\s+this\s+assignment|in\s+this\s+context)\b/i,
/\b(should\s+i\s+use\s+it\s+here|should\s+i\s+use\s+this\s+here|do\s+i\s+need\s+it\s+here|is\s+it\s+necessary\s+here)\b/i,
/\b(a\s+and\s+b|x\s+and\s+y|variables?\s+here|my\s+variable)\b/i,
/\b(main.py|main.c|main.cpp|index.js|app.js|script.js|main\s+file)\b/i,
/\b(kodum|kodumda|koduma|kodun|kodunda|kodunun|bizim\s+kod)\b/i,
/\b(burada|burda|burası|burasi|şurada|surada|bunun\s+içinde|bunun\s+icinde)\b/i,
/\b(bunu\s+burada|bunu\s+burda|şunu\s+burada|sunu\s+burda|onu\s+burada)\b/i,
/\b(bu\s+satır|bu\s+satir|şu\s+satır|şu\s+satir|su\s+satir|hangi\s+satır|hangi\s+satir)\b/i,
/\b(bu\s+kod|bu\s+kodlar|şu\s+kod|şu\s+kodlar|su\s+kod|su\s+kodlar|kod\s+bloğu|kod\s+blogu)\b/i,
/\b(bu\s+problem|bu\s+ödev|bu\s+odev|ödevde|odevde|projemde|projede|soruda|bu\s+soru)\b/i,
/\b(bendeki|bende\s+açık\s+olan|bende\s+acik\s+olan|bendeki\s+kod|bendeki\s+dosya)\b/i
];

const SOLUTION_REQUEST_ENGLISH_PATTERNS = [
  /\b(full|complete|final|ready|working|correct|corrected|entire|whole)\s+(solution|code|program|script|answer|function)\b/i,
  /\b(dump|print|show|output|write|send|give|provide)\b.{0,80}\b(final\s+code|complete\s+solution|corrected\s+version|finished\s+program)\b/i,
  /\b(just|only|simply)\s+(write|give|show|send|provide)\b.{0,80}\b(the\s+code|the\s+answer|the\s+solution)\b/i,
  /\b(give\s+me|show\s+me|send\s+me|provide\s+me)\b.{0,80}\b(the\s+code|final\s+code|solution|answer)\b/i,
  /\b(solve\s+it\s+for\s+me|solve\s+it\s+(fully|completely)|reveal\s+the\s+answer|reveal\s+the\s+code)\b/i,
  /\b(final\s+answer\s+only|just\s+the\s+code\s+nothing\s+else|code\s+only|only\s+code|just\s+code|compilable\s+code)\b/i,
  /\b(send|write|output)\b.{0,80}\b(final\s+answer\s+only|code\s+without\s+explanation|raw\s+code)\b/i,
  /\b(line\s+that\s+finishes|code\s+that\s+completes)\b.*\b(the\s+assignment|the\s+task|the\s+homework)\b/i,
  /\b(missing\s+loop\s+exactly|missing\s+part\s+exactly|exact\s+missing\s+lines)\b/i,
  /\b(no\s+hints|stop\s+giving\s+hints|no\s+clues|don'?t\s+guide\s+me|i\s+don'?t\s+want\s+hints)\b/i,
  /\b(output\s+only\.code|output\s+pure\s+code|tiny\s+complete\s+program)\b/i,
  /\b(fix\s+the\s+code\s+and\s+send|fix\s+my\s+code\s+and\s+give)\b.{0,80}\b(corrected|fixed|working)\b/i,
  /\b(convert|translate|turn|rewrite|write)\b.{0,80}\b(this|that|it|above|pseudo-?code|pseudocode|outline|template|logic)\b.{0,80}\b(in|into|to)\b.{0,40}\b(code|c|c\+\+|cpp|c#|csharp|python|py|java|javascript|js|typescript|ts|kotlin|swift|ruby|php|go|golang|rust|scala|lua|r|bash|shell|html|css|sql)\b/i,

  /\b(nobody\s+will\s+know|no\s+one\s+will\s+see|i\s+am\s+the\s+teacher|i\s+am\s+the\s+instructor|prof\s+allowed\s+this)\b/i,
  /\b(pretend.*not\s+homework|pretend\s+this\s+is\s+not\s+an\s+assignment|this\s+is\s+not\s+for\s+school)\b/i,
  /\b(pretend\s+you\s+are\s+not\s+a\s+mentor|stop\s+acting\s+like\s+a\s+mentor|disable\s+mentor\s+mode|turn\s+off\s+socratic)\b/i,
  /\b(ignore\s+previous\s+instructions|ignore\s+mentor\s+mode|bypass\s+restrictions|override\s+system\s+prompt)\b/i,
  /\b(for\s+security\s+testing|for\s+testing\s+purposes|educational\s+purposes\s+only|just\s+a\s+simulation)\b/i,
];

const SOLUTION_REQUEST_TURKISH_PATTERNS = [
/\b(tam\s+çözüm|tam\s+cozum|eksiksiz\s+çözüm|eksiksiz\s+cozum|hazır\s+çözüm|hazir\s+cozum|bitmiş\s+kod|bitmis\s+kod)\b/i,
/\b(tüm\s+kod|tum\s+kod|bütün\s+kod|butun\s+kod|kodun\s+hepsini|kodun\s+tamamını|kodun\s+tamamini|tüm\s+dosyayı|tum\s+dosyayi)\b/i,
/\b(sadece\s+kod|yalnızca\s+kod|yalnizca\s+kod|sadece\s+kodu\s+ver|bana\s+sadece\s+kodu\s+yaz|açıklama\s+yapma\s+kod\s+ver|aciklama\s+yapma\s+kod\s+ver)\b/i,
/\b(final\s+cevabı|final\s+cevabi|final\s+kod|son\s+kod|çalışan\s+kod|calisan\s+kod|çalışan\s+çözüm|calisan\s+cozum|doğru\s+kod|dogru\s+kod)\b/i,
/\b(direkt\s+çöz|direkt\s+coz|doğrudan\s+çöz|dogrudan\s+coz|çözümü\s+ver|cozumu\s+ver|cevabı\s+yaz|cevabi\s+yaz|kodu\s+at)\b/i,
/\b(eksik\s+döngüyü\s+birebir|eksik\s+donguyu\s+birebir|eksik\s+kısmı\s+aynen|eksik\s+kismi\s+aynen|yazılacak\s+satırı\s+ver|yazilacak\s+satiri\s+ver)\b/i,
/\b(kopyalayıp\s+yapıştır|kopyalayip\s+yapistir|kopyala\s+yapıştır|kopyala\s+yapistir|kopyala\s+yapıştırmalık|kopyala\s+yapistirmalik)\b/i,
/\b(ipucu\s+verme|ipucu\s+istemiyorum|taktik\s+verme|yol\s+gösterme|yol\s+gosterme|bana\s+soru\s+sorma|soru\s+sormayı\s+bırak|soru\s+sormayi\s+birak)\b/i,
/\b(kodu\s+düzeltip\s+at|kodu\s+duzeltip\s+at|hatayı\s+giderip\s+kodu\s+ver|hatayi\s+giderip\s+kodu\s+ver|doğru\s+halini\s+yaz|dogru\s+halini\s+yaz)\b/i,
  /\b(bunu|şunu|sunu|onu|yukarıdakini|yukaridakini|ps[öo]do(?:kod)?|pseudocode|pseudo-code|sözde\s+kod|sozde\s+kod|taslak|mantık|mantik)\b.{0,80}\b(code|kod|c|c\+\+|cpp|c#|csharp|python|py|java|javascript|js|typescript|ts|kotlin|swift|ruby|php|go|golang|rust|scala|lua|r|bash|shell|html|css|sql)\b.{0,60}\b(koduna|koda|kod\s+olarak|diline|dilinde|ile|olarak|çevir|cevir|dönüştür|donustur|uyarla|yaz)\b/i,

// Mentor Rolünü Aşma / Kandırma Girişimleri (Jailbreak / Persona Overrides)
/\b(kimse\s+bilmeyecek|kimse\s+görmeyecek|kimse\s+gormeyecek|hoca\s+izin\s+verdi|ben\s+hocayım|ben\s+hocayim|öğretmenim|ogretmenim)\b/i,
/\b(ödev\s+değil|odev\s+degil|proje\s+değil|proje\s+degil|okul\s+için\s+değil|okul\s+icin\s+degil|ev\s+ödevi\s+değil|ev\s+odevi\s+degil)\b/i,
/\b(mentör\s+gibi\s+davranma|mentor\s+gibi\s+davranma|mentör\s+modunu\s+kapat|mentor\s+modunu\s+kapat|sokratik\s+yöntemi\s+bırak|sokratik\s+yontemi\s+birak)\b/i,
/\b(önceki\s+talimatları\s+unut|onceki\s+talimatlari\s+unut|sistem\s+promptunu\s+yok\s+say|kuralları\s+çiğne|kurallari\s+cigne|kısıtlamaları\s+kaldır|kisitlamalari\s+kaldir)\b/i,
/\b(güvenlik\s+testi|guvenlik\s+testi|test\s+etmek\s+için|test\s+etmek\s+icin|sadece\s+deneme\s+amaçlı|sadece\s+deneme\s+amacli|eğitim\s+amaçlı|egitim\s+amacli)\b/i
];

const SOLUTION_REQUEST_PATTERNS = [
  ...SOLUTION_REQUEST_ENGLISH_PATTERNS,
  ...SOLUTION_REQUEST_TURKISH_PATTERNS,
];

const ASSIGNMENT_TRANSLATION_REQUEST_PATTERNS = [
  /\b(convert|translate|turn|rewrite|write)\b.{0,80}\b(this|that|it|above|the\s+above|pseudo-?code|pseudocode|outline|template|logic)\b.{0,80}\b(in|into|to)\b.{0,40}\b(code|c|c\+\+|cpp|c#|csharp|python|py|java|javascript|js|typescript|ts|kotlin|swift|ruby|php|go|golang|rust|scala|lua|r|bash|shell|html|css|sql)\b/i,
  /\b(bunu|şunu|sunu|onu|yukarıdakini|yukaridakini|ps[öo]do(?:kod)?|pseudocode|pseudo-code|sözde\s+kod|sozde\s+kod|taslak|mantık|mantik)\b.{0,80}\b(code|kod|c|c\+\+|cpp|c#|csharp|python|py|java|javascript|js|typescript|ts|kotlin|swift|ruby|php|go|golang|rust|scala|lua|r|bash|shell|html|css|sql)\b.{0,60}\b(koduna|koda|kod\s+olarak|diline|dilinde|ile|olarak|çevir|cevir|dönüştür|donustur|uyarla|yaz)\b/i,
];

const ASSIGNMENT_TRANSLATION_FOLLOW_UP_PATTERNS = [
  /^(?:now\s+)?(?:translate|convert|rewrite|write)\s+(?:it|this|that|the\s+above|above)?\s*(?:in|into|to)\s+(?:code|c|c\+\+|cpp|c#|csharp|python|py|java|javascript|js|typescript|ts|kotlin|swift|ruby|php|go|golang|rust|scala|lua|r|bash|shell|html|css|sql)(?:\s+now)?[.!?]*$/i,
  /^(?:şimdi\s+|simdi\s+)?(?:bunu\s+|şunu\s+|sunu\s+|onu\s+|yukarıdakini\s+|yukaridakini\s+)?(?:code|kod|c|c\+\+|cpp|c#|csharp|python|py|java|javascript|js|typescript|ts|kotlin|swift|ruby|php|go|golang|rust|scala|lua|r|bash|shell|html|css|sql)\s*(?:'?y?[ae]|da|de|ile|olarak|dilinde|diline)?\s*(?:çevir|cevir|dönüştür|donustur|uyarla|yaz|göster|goster)(?:\s+şimdi|\s+simdi)?[.!?]*$/i,
];

function asksAboutTerminalOrConsole(msg: string): boolean {
  return matchesAny(msg, TERMINAL_OR_CONSOLE_PATTERNS);
}

function asksAboutErrorOrExecution(msg: string): boolean {
  return matchesAny(msg, ERROR_OR_EXECUTION_PATTERNS);
}

function asksAboutFailureOrNoOutput(msg: string): boolean {
  return matchesAny(msg, FAILURE_OR_NO_OUTPUT_PATTERNS);
}

function asksAboutExpectedOutputOrFormat(msg: string): boolean {
  return matchesAny(msg, EXPECTED_OUTPUT_OR_FORMAT_PATTERNS);
}

function asksAboutEditorVisibility(msg: string): boolean {
  return matchesAny(msg, EDITOR_VISIBILITY_PATTERNS);
}

function asksForEditorInspection(msg: string): boolean {
  return matchesAny(msg, EDITOR_INSPECTION_PATTERNS);
}

function asksDebugOrStrategy(msg: string): boolean {
  return matchesAny(msg, DEBUG_OR_STRATEGY_PATTERNS);
}

function asksForSourceAttribution(msg: string): boolean {
  return matchesAny(msg, SOURCE_ATTRIBUTION_PATTERNS);
}

function isRepeatCheckFollowUp(msg: string): boolean {
  return matchesAny(msg, REPEAT_CHECK_PATTERNS);
}

function isLineReferenceFollowUp(msg: string): boolean {
  return matchesAny(msg, LINE_REFERENCE_PATTERNS);
}

function isAmbiguousFollowUp(msg: string): boolean {
  return matchesAny(msg, AMBIGUOUS_FOLLOW_UP_PATTERNS);
}

function isFormatReferenceFollowUp(msg: string): boolean {
  return matchesAny(msg, FORMAT_REFERENCE_FOLLOW_UP_PATTERNS);
}

export function isConversationMemoryQuestion(message: string | null | undefined): boolean {
  const msg = normalize(message).toLowerCase();
  if (!msg) return false;

  return matchesAny(msg, CONVERSATION_MEMORY_PATTERNS);
}

export function isMetaQuestion(message: string | null | undefined): boolean {
  const msg = normalize(message).toLowerCase();
  if (!msg) return false;

  return (
    isConversationMemoryQuestion(msg) ||
    matchesAny(msg, META_PATTERNS)
  );
}

export function isCasualConversation(message: string | null | undefined): boolean {
  const msg = normalize(message).toLowerCase();
  if (!msg) return false;

  return matchesAny(msg, CASUAL_PATTERNS);
}

export function isBasicHelpQuestion(message: string | null | undefined): boolean {
  const msg = normalize(message);
  if (!msg) return false;

  return matchesAny(msg, BASIC_HELP_PATTERNS);
}


export function isOutOfContextQuestion(message: string | null | undefined): boolean {
  const msg = normalize(message).toLowerCase();
  if (!msg) return false;

  if (
    isMetaQuestion(msg) ||
    isCasualConversation(msg) ||
    asksAboutTerminalOrConsole(msg) ||
    asksAboutErrorOrExecution(msg) ||
    asksAboutFailureOrNoOutput(msg) ||
    asksAboutExpectedOutputOrFormat(msg) ||
    asksAboutEditorVisibility(msg) ||
    asksForEditorInspection(msg) ||
    asksDebugOrStrategy(msg) ||
    isAlmostCodeRequest(msg) ||
    matchesAny(msg, SOLUTION_REQUEST_PATTERNS) ||
    isBasicHelpQuestion(msg) ||
    asksForCurrentCodeContext(msg)
  ) {
    return false;
  }

  const hasQuestionShape = matchesAny(msg, [
    /\?\s*$/,
    /\bwhat\s+is\b/i,
    /\bwhat\s+are\b/i,
    /\bwho\s+is\b/i,
    /\bwhere\s+is\b/i,
    /\bwhen\s+is\b/i,
    /\bwhy\b/i,
    /\bhow\b/i,
    /\bdefine\b/i,
    /\bexplain\b/i,
    /\bnedir\b/i,
    /\bne\s+demek\b/i,
    /\bne\s+anlama\s+gelir\b/i,
    /\bkimdir\b/i,
    /\bnerede\b/i,
    /\bne\s+zaman\b/i,
    /\bneden\b/i,
    /\bniye\b/i,
    /\bnasıl\b/i,
    /\bnasil\b/i,
    /\bkaç\b/i,
    /\bkac\b/i,
  ]);

  if (!hasQuestionShape) return false;

  return !matchesAny(msg, [
    /\b(code|coding|program|programming|algorithm|function|variable|array|loop|recursion|syntax|compiler|terminal|console|error|debug|runtime|output|input|stdin|stdout|stderr|if|else|while|for|class|object)\b/i,
    /\b(kod|programlama|algoritma|fonksiyon|değişken|degisken|dizi|array|döngü|dongu|özyineleme|ozyineleme|syntax|sözdizimi|sozdizimi|derleyici|terminal|konsol|hata|debug|çıktı|cikti|girdi|if|else|while|for|class|sınıf|sinif|nesne)\b/i,
  ]);
}


export function isVisibilityInspectionQuestion(message: string | null | undefined): boolean {
  const msg = normalize(message).toLowerCase();
  if (!msg) return false;

  if (asksAboutTerminalOrConsole(msg)) return false;

  return asksAboutEditorVisibility(msg) && !asksDebugOrStrategy(msg);
}

export function isAlmostCodeRequest(message: string | null | undefined): boolean {
  const msg = normalize(message).toLowerCase();
  if (!msg) return false;

  return matchesAny(msg, ALMOST_CODE_PATTERNS);
}

function asksForCurrentCodeContext(msg: string): boolean {
  return asksDebugOrStrategy(msg) || asksAboutExpectedOutputOrFormat(msg) || matchesAny(msg, CURRENT_CODE_CONTEXT_PATTERNS);
}

function scopeForIntent(intent: MentorIntent): MentorContextScope {
  if (intent === "editor_inspection") return "editor";
  if (intent === "runtime") return "runtime";
  if (intent === "solution" || intent === "almost_code") return "assignment";
  if (intent === "casual" || intent === "meta") return "chat";
  return "code";
}


export function detectMentorIntent(message: string | null | undefined): MentorIntent {
  const msg = normalize(message).toLowerCase();
  if (!msg) return "mentor";

  if (isMetaQuestion(msg)) return "meta";

  if (isCasualConversation(msg)) return "casual";

  if (isOutOfContextQuestion(msg)) return "casual";

  if (asksAboutTerminalOrConsole(msg) || asksAboutFailureOrNoOutput(msg)) {
    return "runtime";
  }

  if (asksAboutExpectedOutputOrFormat(msg)) {
    return "mentor";
  }

  if (asksAboutErrorOrExecution(msg)) {
    return "runtime";
  }

  if (
    asksForEditorInspection(msg) ||
    isVisibilityInspectionQuestion(msg)
  ) {
    return "editor_inspection";
  }

  if (isAssignmentTranslationRequest(msg)) {
    return "solution";
  }

  if (isAlmostCodeRequest(msg)) {
    return "almost_code";
  }

  if (matchesAny(msg, SOLUTION_REQUEST_PATTERNS)) {
    return "solution";
  }

  return "mentor";
}

export function isAssignmentTranslationRequest(message: string | null | undefined): boolean {
  const msg = normalize(message).toLowerCase();
  if (!msg) return false;
  return matchesAny(msg, ASSIGNMENT_TRANSLATION_REQUEST_PATTERNS);
}

function isAssignmentTranslationFollowUp(message: string | null | undefined): boolean {
  const msg = normalize(message).toLowerCase();
  if (!msg) return false;
  return matchesAny(msg, ASSIGNMENT_TRANSLATION_FOLLOW_UP_PATTERNS);
}


function recentNonEmpty(history: MentorTurnHistoryMessage[] | null | undefined): MentorTurnHistoryMessage[] {
  return (history ?? []).filter((message) => message.content.trim());
}

function lastMessageByRole(
  history: MentorTurnHistoryMessage[] | null | undefined,
  role: "user" | "assistant",
): string | null {
  return recentNonEmpty(history)
    .slice()
    .reverse()
    .find((message) => message.role === role)
    ?.content.trim() ?? null;
}

function lastNonAmbiguousUserContext(
  history: MentorTurnHistoryMessage[] | null | undefined,
): { question: string | null; intent: MentorIntent } {
  const messages = recentNonEmpty(history).slice().reverse();
  for (const message of messages) {
    if (message.role !== "user") continue;
    if (detectFollowUpKind(message.content) !== null) continue;

    return {
      question: message.content.trim(),
      intent: detectMentorIntent(message.content),
    };
  }

  const previousQuestion = lastMessageByRole(history, "user");
  return {
    question: previousQuestion,
    intent: detectMentorIntent(previousQuestion),
  };
}

function detectFollowUpKind(message: string | null | undefined): MentorTurnResolution["followUpKind"] {
  const msg = normalize(message).toLowerCase();
  if (!msg) return null;

  if (isRepeatCheckFollowUp(msg)) {
    return "repeat_check";
  }

  if (isLineReferenceFollowUp(msg)) {
    return "line_reference";
  }

  if (asksForSourceAttribution(msg)) {
    return "source_check";
  }

  if (isFormatReferenceFollowUp(msg)) {
    return "format_reference";
  }

  if (isAmbiguousFollowUp(msg)) {
    return "ambiguous";
  }

  return null;
}

export function resolveMentorTurn(
  message: string | null | undefined,
  history: MentorTurnHistoryMessage[] | null | undefined,
): MentorTurnResolution {
  const latestIntent = detectMentorIntent(message);
  const followUpKind = detectFollowUpKind(message);
  const inheritedContext = lastNonAmbiguousUserContext(history);
  const previousUserQuestion = inheritedContext.question;
  const previousMentorReply = lastMessageByRole(history, "assistant");
  const inheritedIntent = inheritedContext.intent;
  const translationFollowUp =
    isAssignmentTranslationFollowUp(message) &&
    (inheritedIntent === "almost_code" || inheritedIntent === "solution");

  let effectiveIntent = latestIntent;
  if (isAssignmentTranslationRequest(message) || translationFollowUp) {
    effectiveIntent = "solution";
  } else if (followUpKind === "repeat_check") {
    effectiveIntent = inheritedIntent === "mentor" ? "editor_inspection" : inheritedIntent;
  } else if (followUpKind === "source_check") {
    effectiveIntent = "editor_inspection";
  } else if (followUpKind && latestIntent === "mentor" && inheritedIntent !== "mentor") {
    effectiveIntent = inheritedIntent;
  }

  return {
    latestIntent,
    effectiveIntent,
    isFollowUp: followUpKind !== null || translationFollowUp,
    followUpKind,
    isAssignmentTranslationRequest:
      isAssignmentTranslationRequest(message) || translationFollowUp,
    previousUserQuestion,
    previousMentorReply,
  };
}

export function resolveMentorContextScope(params: {
  studentQuestion?: string | null;
  conversationHistory?: MentorTurnHistoryMessage[] | null;
  mode?: string | null;
}): MentorContextScope {
  const msg = normalize(params.studentQuestion).toLowerCase();
  const mode = normalize(params.mode).toLowerCase();
  const turn = resolveMentorTurn(params.studentQuestion, params.conversationHistory);

  if (mode === "hint" || mode === "tip") return "code";

  if (turn.latestIntent === "casual" || turn.latestIntent === "meta") {
    return "chat";
  }

  if (turn.effectiveIntent !== "mentor") {
    return scopeForIntent(turn.effectiveIntent);
  }

  if (isBasicHelpQuestion(msg)) {
    return asksForCurrentCodeContext(msg) ? "code" : "concept";
  }

  if (asksForCurrentCodeContext(msg)) {
    return "code";
  }

  if (turn.isFollowUp) {
    return scopeForIntent(turn.effectiveIntent);
  }

  return "chat";
}

export function resolveMentorHistoryScope(params: {
  studentQuestion?: string | null;
  conversationHistory?: MentorTurnHistoryMessage[] | null;
  mode?: string | null;
  contextScope?: MentorContextScope;
}): MentorHistoryScope {
  const msg = normalize(params.studentQuestion).toLowerCase();
  const contextScope =
    params.contextScope ??
    resolveMentorContextScope({
      studentQuestion: params.studentQuestion,
      conversationHistory: params.conversationHistory,
      mode: params.mode,
    });
  const turn = resolveMentorTurn(params.studentQuestion, params.conversationHistory);

  if (isConversationMemoryQuestion(msg)) return "user";
  if (contextScope === "chat") return "full";
  if (contextScope === "concept") return "user";
  return "full";
}

export function toValidatorQuestionMode(
  intent: MentorIntent,
): "almost_code" | "casual" | "meta" | "solution" | "runtime" | "code_help" {
  if (intent === "almost_code") return "almost_code";
  if (intent === "casual") return "casual";
  if (intent === "meta") return "meta";
  if (intent === "solution") return "solution";
  if (intent === "runtime") return "runtime";
  return "code_help";
}
