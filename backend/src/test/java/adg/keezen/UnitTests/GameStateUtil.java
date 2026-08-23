package adg.keezen.UnitTests;

import static com.adg.openapi.model.MoveType.MOVE;
import static com.adg.openapi.model.MoveType.SPLIT;
import static com.adg.openapi.model.MoveType.SWITCH;
import static com.adg.openapi.model.TempMessageType.MAKE_MOVE;

import adg.keezen.CardsDeckInterface;
import adg.keezen.GameState;
import adg.processing.ProcessOnMove;
import com.adg.openapi.model.Card;
import com.adg.openapi.model.MoveRequest;
import com.adg.openapi.model.MoveResponse;
import com.adg.openapi.model.Pawn;
import com.adg.openapi.model.PawnId;
import com.adg.openapi.model.Player;
import com.adg.openapi.model.PositionKey;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Random;

public class GameStateUtil {

  public static Pawn placePawnOnNest(
      GameState gameState, String playerId, PositionKey currentTile) {
    // for creating pawns for different players
    PawnId pawnId1 = new PawnId(playerId, 0);
    PositionKey nestTile = new PositionKey(playerId, -1);
    Pawn pawn1 = new Pawn(playerId, pawnId1, currentTile, nestTile);
    pawn1.setCurrentTileId(currentTile);
    gameState.movePawn(pawn1);
    return pawn1;
  }

  public static Pawn placePawnOnBoard(GameState gameState, PawnId pawnId, PositionKey currentTile) {
    // for creating multiple pawns for the same player
    String playerId = pawnId.getPlayerId();
    PositionKey nestTile = new PositionKey(playerId, -pawnId.getPawnNr() - 1);
    Pawn pawn1 = new Pawn(playerId, pawnId, currentTile, nestTile);
    gameState.movePawn(pawn1);
    return pawn1;
  }

  public static Pawn placePawnOnBoard(GameState gameState, Pawn pawn) {
    // for creating multiple pawns for the same player
    pawn.setCurrentTileId(pawn.getCurrentTileId());
    gameState.movePawn(pawn);
    return pawn;
  }

  public static Card givePlayerCard(CardsDeckInterface cardsDeck, int playerInt, int nrSteps) {
    String playerId = String.valueOf(playerInt);
    Card card = new Card().suit(0).value(nrSteps).uuid(999);
    cardsDeck.setPlayerCard(playerId, card);
    return card;
  }

  public static Card givePlayerAce(CardsDeckInterface cardsDeck, int playerInt) {
    String playerId = String.valueOf(playerInt);
    Card ace = new Card().suit(0).value(1).uuid(999);
    cardsDeck.giveCardToPlayerForTesting(playerId, ace);
    return ace;
  }

  public static Card givePlayerKing(CardsDeckInterface cardsDeck, int playerInt) {
    String playerId = String.valueOf(playerInt);
    Card king = new Card().suit(0).value(12).uuid(999);
    cardsDeck.giveCardToPlayerForTesting(playerId, king);
    return king;
  }

  public static Card givePlayerSeven(CardsDeckInterface cardsDeck, int playerInt) {
    String playerId = String.valueOf(playerInt);
    Card sevenCard = new Card().suit(0).value(7).uuid(new Random().nextInt());
    cardsDeck.giveCardToPlayerForTesting(playerId, sevenCard);
    return sevenCard;
  }

  public static Card givePlayerJack(CardsDeckInterface cardsDeck, int playerInt) {
    String playerId = String.valueOf(playerInt);
    Card jack = new Card().suit(0).value(11).uuid(999);
    cardsDeck.giveCardToPlayerForTesting(playerId, jack);
    return jack;
  }

  public static void createSplitMessage(
      MoveRequest moveMessage, Pawn pawn, int nrSteps1, Pawn pawn2, Integer nrSteps2, Card card) {
    // todo: replace with rest call

    moveMessage.setPlayerId(pawn.getPlayerId());
    moveMessage.setPawn1Id(pawn.getPawnId());
    moveMessage.setStepsPawn1(nrSteps1);
    moveMessage.setStepsPawn2(nrSteps2);
    moveMessage.setPawn2Id(pawn2.getPawnId());
    moveMessage.setMoveType(SPLIT);
    moveMessage.setCardId(card.getUuid());
    moveMessage.setTempMessageType(MAKE_MOVE);
  }

  public static void createMoveRequest(MoveRequest moveMessage, Pawn pawn, Card card) {
    // todo: replace with restcall

    moveMessage.setPlayerId(pawn.getPlayerId());
    moveMessage.setPawn1Id(pawn.getPawnId());
    moveMessage.setMoveType(MOVE);
    moveMessage.setStepsPawn1(card.getValue());
    moveMessage.setCardId(card.getUuid());
    moveMessage.setTempMessageType(MAKE_MOVE);
  }

  public static void createSwitchMessage(
      MoveRequest moveMessage, Pawn pawn1, Pawn pawn2, Card card) {
    // todo: replace with rest call

    moveMessage.setPlayerId(pawn1.getPlayerId());
    moveMessage.setPawn1Id(pawn1.getPawnId());
    moveMessage.setPawn2Id(pawn2.getPawnId());
    moveMessage.setCardId(card.getUuid());
    moveMessage.setMoveType(SWITCH);
    moveMessage.setTempMessageType(MAKE_MOVE);
  }

  public static void sendForfeitMessage(GameState gameState, String playerId) {
    // todo: replace with rest call
    gameState.processOnForfeit(playerId);
  }

  public static void sendValidMoveRequest(
      GameState gameState, CardsDeckInterface cardsDeck, String playerId) {
    // todo: replace with rest call

    // get the first pawn of the player
    Pawn pawn = gameState.getPawn(new Pawn().playerId(playerId).pawnId(new PawnId(playerId, 0)));

    // place the pawn on the board (playerId,1)
    placePawnOnNest(gameState, playerId, new PositionKey(playerId, 1));

    // fake a valid card
    Card card = new Card().suit(0).value(5).uuid(new Random().nextInt());

    // replace a card from the players hand with this card
    cardsDeck.giveCardToPlayerForTesting(playerId, card);

    // send move message
    MoveRequest moveMessage = new MoveRequest();
    moveMessage.setPlayerId(playerId);
    moveMessage.setPawn1Id(pawn.getPawnId());
    moveMessage.setMoveType(MOVE);
    moveMessage.setStepsPawn1(card.getValue());
    moveMessage.setCardId(card.getUuid());
    moveMessage.setTempMessageType(MAKE_MOVE);

    // process
    MoveResponse moveResponse = new MoveResponse();
    ProcessOnMove.process(gameState, moveMessage, moveResponse);
  }

  public static void playRemainingCards(
      GameState gameState, CardsDeckInterface cardsDeck, String playerId) {
    int nrCards = cardsDeck.getCardsForPlayer(playerId).size();
    for (int i = 0; i < nrCards; i++) {
      sendValidMoveRequest(gameState, cardsDeck, playerId);
    }
  }

  public static ArrayList<String> stringsToList(String[] strings) {
    ArrayList<String> result = new ArrayList<>();
    Collections.addAll(result, strings);
    return result;
  }

  public static void place4PawnsOnFinish(GameState gameState, String playerId) {
    placePawnOnBoard(gameState, new PawnId(playerId, 0), new PositionKey(playerId, 16));
    placePawnOnBoard(gameState, new PawnId(playerId, 1), new PositionKey(playerId, 17));
    placePawnOnBoard(gameState, new PawnId(playerId, 2), new PositionKey(playerId, 18));
    placePawnOnBoard(gameState, new PawnId(playerId, 3), new PositionKey(playerId, 19));
  }

  public static void createGame_With_NPlayers(GameState gameState, int nrPlayers) {
    gameState.stop();
    for (int i = 0; i < nrPlayers; i++) {
      gameState.addPlayer(new Player(String.valueOf(i), String.valueOf(i)));
    }
    gameState.start(false);
  }
}
