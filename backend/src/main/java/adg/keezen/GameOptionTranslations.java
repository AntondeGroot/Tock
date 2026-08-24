package adg.keezen;

import java.util.Map;

/**
 * Localized labels/descriptions for the game options, keyed by the {@link
 * com.adg.openapi.model.GameOption}'s {@code labelKey}/{@code descriptionKey} then locale.
 * The Keezen backend resolves these itself (mirroring {@code GameNameController}) so the
 * GameRoom just displays the returned strings, like it does for the game name.
 *
 * <p>English is NOT stored here — callers pass the English label/description from {@link
 * KeezenGameOptions} as the fallback, which is also used for any missing locale or key.
 * Locales match the game-name endpoint: nl, de, fr, nb, it.
 *
 * <p>Uses {@code Map.ofEntries} rather than {@code Map.of}: the latter caps at 10 key/value
 * pairs, which two more options would have silently blown past.
 *
 * <p><b>Draft translations — please review.</b> The short labels are the priority; the
 * longer descriptions (game-rule wording) especially warrant a native-speaker check.
 */
public final class GameOptionTranslations {

  private GameOptionTranslations() {}

  private static final Map<String, Map<String, String>> STRINGS = Map.ofEntries(
      Map.entry("gameOption.cannotMoveOutOfFinish.label", Map.of(
          "nl", "Finish niet meer verlaten",
          "de", "Ziel nicht mehr verlassen",
          "fr", "Interdit de quitter l'arrivée",
          "nb", "Kan ikke forlate mål",
          "it", "Vietato uscire dall'arrivo")),
      Map.entry("gameOption.cannotMoveOutOfFinish.description", Map.of(
          "nl", "Indien ingeschakeld kan een pion die de finish heeft bereikt daar nooit meer "
              + "weg. Alleen de vier gaat achteruit, dus dit is wat voorkomt dat een vier een "
              + "pion de finish weer uit trekt, terug naar het bord.",
          "de", "Wenn aktiviert, kann eine Figur, die das Ziel erreicht hat, es nie wieder "
              + "verlassen. Nur die Vier zieht rückwärts, also verhindert dies, dass eine Vier "
              + "eine Figur aus dem Ziel zurück auf das Feld holt.",
          "fr", "Si activé, un pion qui a atteint l'arrivée ne peut plus jamais en sortir. "
              + "Seul le quatre recule, c'est donc ce qui empêche un quatre de ramener un pion "
              + "hors de l'arrivée, de retour sur le plateau.",
          "nb", "Når aktivert kan en brikke som har nådd mål aldri forlate det igjen. Bare "
              + "firreren går bakover, så dette er det som hindrer en firrer i å trekke en "
              + "brikke ut av mål og tilbake på brettet.",
          "it", "Se attivo, una pedina che ha raggiunto l'arrivo non può più uscirne. Solo il "
              + "quattro va all'indietro, quindi è questo a impedire che un quattro riporti una "
              + "pedina fuori dall'arrivo, di nuovo sul tabellone.")),
      Map.entry("gameOption.exactMoveRequired.label", Map.of(
          "nl", "Exacte zet vereist",
          "de", "Exakter Zug erforderlich",
          "fr", "Déplacement exact requis",
          "nb", "Nøyaktig trekk kreves",
          "it", "Mossa esatta richiesta")),
      Map.entry("gameOption.exactMoveRequired.description", Map.of(
          "nl", "Indien ingeschakeld moet een pion exact op zijn bestemming landen. "
              + "Van richting veranderen mag niet: terugkaatsen op een geblokkeerd startveld "
              + "of voorbij de finish schieten wordt als een ongeldige zet geweigerd.",
          "de", "Wenn aktiviert, muss eine Figur genau auf ihrem Zielfeld landen. "
              + "Richtungswechsel sind nicht erlaubt: das Abprallen an einem blockierten "
              + "Startfeld oder das Überschreiten der Ziellinie wird als ungültiger Zug abgelehnt.",
          "fr", "Si activé, un pion doit s'arrêter exactement sur sa destination. "
              + "Les changements de direction sont interdits : rebondir sur une case de départ "
              + "bloquée ou dépasser la ligne d'arrivée sera refusé comme un coup illégal.",
          "nb", "Når aktivert må en brikke lande nøyaktig på målfeltet. "
              + "Retningsendringer er ikke tillatt: å sprette av et blokkert startfelt eller "
              + "å gå forbi målfeltet avvises som et ulovlig trekk.",
          "it", "Se attivato, una pedina deve fermarsi esattamente sulla destinazione. "
              + "I cambi di direzione non sono consentiti: rimbalzare su una casella di partenza "
              + "bloccata o superare il traguardo verrà rifiutato come mossa non valida.")),
      Map.entry("gameOption.mustPlayIfPossible.label", Map.of(
          "nl", "Verplicht zetten indien mogelijk",
          "de", "Zugpflicht wenn möglich",
          "fr", "Jouer obligatoirement si possible",
          "nb", "Må spille hvis mulig",
          "it", "Obbligo di giocare se possibile")),
      Map.entry("gameOption.mustPlayIfPossible.description", Map.of(
          "nl", "Indien ingeschakeld kun je je beurt niet overslaan als er een geldige zet "
              + "mogelijk is. Pionnen die al in de finish staan zijn uitgezonderd — die hoef "
              + "je nooit te verplaatsen.",
          "de", "Wenn aktiviert, kannst du deinen Zug nicht aussetzen, solange ein gültiger "
              + "Zug möglich ist. Figuren, die bereits im Ziel sind, sind ausgenommen — du "
              + "musst sie nie bewegen.",
          "fr", "Si activé, vous ne pouvez pas passer votre tour tant qu'un coup valide est "
              + "possible. Les pions déjà dans l'arrivée sont exemptés — vous n'êtes jamais "
              + "obligé de les déplacer.",
          "nb", "Når aktivert kan du ikke stå over turen hvis et gyldig trekk er mulig. "
              + "Brikker som allerede er i mål er unntatt — du må aldri flytte dem.",
          "it", "Se attivato, non puoi passare il turno se è disponibile una mossa valida. "
              + "Le pedine già arrivate sono esentate — non sei mai obbligato a spostarle.")),
      Map.entry("gameOption.teamPlay.label", Map.of(
          "nl", "Teamspel",
          "de", "Teamspiel",
          "fr", "Jeu en équipe",
          "nb", "Lagspill",
          "it", "Gioco a squadre")),
      Map.entry("gameOption.teamPlay.description", Map.of(
          "nl", "Speel in teams van twee: elke speler vormt een team met de speler recht "
              + "tegenover hem, dus de tafel valt uiteen in paren (8 spelers maken 4 teams). "
              + "Teamgenoten helpen elkaar, en een team wint zodra alle pionnen van beide spelers "
              + "thuis zijn.",
          "de", "Spielt in Zweierteams: jeder Spieler bildet ein Team mit dem direkt "
              + "gegenübersitzenden Spieler, der Tisch teilt sich also in Paare (8 Spieler ergeben "
              + "4 Teams). Teamkollegen helfen einander, und ein Team gewinnt, sobald alle Figuren "
              + "beider Mitglieder im Ziel sind.",
          "fr", "Jouez en équipes de deux : chaque joueur fait équipe avec le joueur situé juste "
              + "en face, la table se répartit donc en paires (8 joueurs font 4 équipes). Les "
              + "coéquipiers s'entraident, et une équipe gagne dès que tous les pions des deux "
              + "membres sont à l'arrivée.",
          "nb", "Spill i lag på to: hver spiller danner lag med spilleren rett overfor, så "
              + "bordet deles i par (8 spillere gir 4 lag). Lagkamerater hjelper hverandre, og et "
              + "lag vinner når alle brikkene til begge medlemmene er i mål.",
          "it", "Gioca in squadre da due: ogni giocatore fa squadra con quello seduto di fronte, "
              + "quindi il tavolo si divide in coppie (8 giocatori formano 4 squadre). I compagni "
              + "si aiutano a vicenda e una squadra vince quando tutte le pedine di entrambi i "
              + "membri sono arrivate.")),
      Map.entry("gameOption.teamCardTrade.label", Map.of(
          "nl", "Vraag teamgenoot om een Heer of Aas",
          "de", "Teamkollegen um König oder Ass bitten",
          "fr", "Demander un Roi ou un As à son coéquipier",
          "nb", "Be lagkameraten om en Konge eller Ess",
          "it", "Chiedi al compagno un Re o un Asso")),
      Map.entry("gameOption.teamCardTrade.description", Map.of(
          "nl", "Alleen bij teamspel: bied een kaart aan je teamgenoot aan en vraag om een Heer "
              + "of Aas om een pion op het bord te krijgen. Zij geven er een (een ruil) of weigeren.",
          "de", "Nur im Teamspiel: biete deinem Teamkollegen eine Karte an und bitte um einen "
              + "König oder ein Ass, um eine Figur aufs Brett zu bekommen. Er gibt einen her (ein "
              + "Tausch) oder lehnt ab.",
          "fr", "En jeu en équipe seulement : propose une carte à ton coéquipier et demande un "
              + "Roi ou un As pour sortir un pion. Il t'en donne un (un échange) ou refuse.",
          "nb", "Bare i lagspill: tilby et kort til lagkameraten og be om en Konge eller Ess for "
              + "å få en brikke på brettet. Han gir deg ett (et bytte) eller takker nei.",
          "it", "Solo nel gioco a squadre: offri una carta al compagno e chiedi un Re o un Asso "
              + "per portare una pedina in gioco. Lui te ne dà uno (uno scambio) o rifiuta.")));

  /**
   * The localized string for a {@code labelKey}/{@code descriptionKey}, or {@code
   * englishFallback} for any missing locale or key.
   */
  public static String resolve(String key, String englishFallback, String locale) {
    if (key == null || locale == null) return englishFallback;
    Map<String, String> byLocale = STRINGS.get(key);
    if (byLocale == null) return englishFallback;
    return byLocale.getOrDefault(locale.toLowerCase(), englishFallback);
  }
}
