package adg.keezen.ApiTests;

import static adg.keezen.utils.ApiModelHelpers.getRandomRoomName;
import static org.junit.Assert.assertThrows;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import adg.keezen.utils.ApiCallsHelper;
import adg.keezen.utils.BaseUnitTest;
import com.adg.openapi.model.Player;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.HttpClientErrorException;

class ApiGameCreationTest extends BaseUnitTest {

  private final ApiCallsHelper apiHelper = new ApiCallsHelper();

  @Test
  void cannotCreateGame_withEmptyRoomName_throws400ErrorCode() {
    // GIVEN a game has started
    assertThrows(
        HttpClientErrorException.BadRequest.class,
        () -> {
          apiHelper.createNewGame("", 3);
        });
  }

  @Test
  void cannotCreateGame_withBlankRoomName_throws400ErrorCode() {
    // GIVEN a game has started
    assertThrows(
        HttpClientErrorException.BadRequest.class,
        () -> {
          apiHelper.createNewGame(" ", 3);
        });
  }

  @Test
  void cannotCreateGame_withTooShortRoomName_throws400ErrorCode() {
    // GIVEN a game has started
    assertThrows(
        HttpClientErrorException.BadRequest.class,
        () -> {
          apiHelper.createNewGame("ab", 3);
        });
  }

  @Test
  void cannotCreateGame_withTooShortEmptyRoomName_throws400ErrorCode() {
    assertThrows(
        HttpClientErrorException.BadRequest.class,
        () -> {
          apiHelper.createNewGame("  .", 3);
        });
  }

  // A room name only has to be free among games still waiting for players. A group that finished a
  // game starts the next one from the GameRoom under the same name — while someone may still have
  // the old game open on a phone, keeping it running. That old game must not block the new one.
  @Test
  void canCreateGame_withTheNameOfAGameThatHasStarted() {
    // GIVEN a game of this name that has started
    String roomName = getRandomRoomName();
    String startedGame = apiHelper.createNewGame(roomName, 2);
    for (int i = 0; i < 2; i++) {
      apiHelper.addPlayerToGame(startedGame, new Player("player" + i, "player" + i));
    }
    apiHelper.startGameForTesting(startedGame);

    // WHEN a new game of that name is created
    String newGame = apiHelper.createNewGame(roomName, 2);

    // THEN it is created, as a game of its own
    assertNotEquals(startedGame, newGame);
  }
}
