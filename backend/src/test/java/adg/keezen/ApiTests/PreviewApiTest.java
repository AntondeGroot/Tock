package adg.keezen.ApiTests;

import static org.junit.jupiter.api.Assertions.*;

import adg.keezen.utils.BaseUnitTest;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

/**
 * Smoke tests for the preview HTML endpoints.
 * Every scenario must return 200 with an HTML body containing player links and
 * a back-link to the list. Unknown scenarios must return 404.
 */
class PreviewApiTest extends BaseUnitTest {

  private final RestTemplate rest = new RestTemplate();
  private static final String BASE = "http://localhost:4200/preview/";

  private static final List<String> SCENARIOS = List.of(
      "2-players", "3-players", "4-players", "5-players", "8-players", "team", "8-players-teams", "medals", "cards");

  @Test
  void allScenarios_return200_withHtmlBody() {
    for (String scenario : SCENARIOS) {
      ResponseEntity<String> resp = rest.getForEntity(BASE + scenario, String.class);
      assertEquals(200, resp.getStatusCode().value(),
          "Expected 200 for: " + scenario);
      String body = resp.getBody();
      assertNotNull(body, "Null body for: " + scenario);
      assertTrue(body.contains("sessionid"),
          "Expected player link with sessionId for: " + scenario);
      assertTrue(body.contains("back to list"),
          "Expected back-link for: " + scenario);
    }
  }

  @Test
  void listPage_returns200_withAllScenarioLinks() {
    ResponseEntity<String> resp = rest.getForEntity("http://localhost:4200/preview", String.class);
    assertEquals(200, resp.getStatusCode().value());
    String body = resp.getBody();
    assertNotNull(body);
    for (String scenario : SCENARIOS) {
      assertTrue(body.contains(scenario),
          "Landing page missing link to: " + scenario);
    }
  }

  @Test
  void cardsScenario_hasPlayerLink_forActivePlayer() {
    ResponseEntity<String> resp = rest.getForEntity(BASE + "cards", String.class);
    String body = resp.getBody();
    assertNotNull(body);
    assertTrue(body.contains("your turn"), "Expected active-player label in cards scenario");
    assertTrue(body.contains("btn primary"), "Expected gold primary button for active player");
  }

  @Test
  void medalsScenario_hasPlayerLinks_forAllThreePlayers() {
    ResponseEntity<String> resp = rest.getForEntity(BASE + "medals", String.class);
    String body = resp.getBody();
    assertNotNull(body);
    assertTrue(body.contains("Player 1"), "Expected Player 1 link");
    assertTrue(body.contains("Player 2"), "Expected Player 2 link");
    assertTrue(body.contains("Player 3"), "Expected Player 3 link");
  }

  @Test
  void unknownScenario_returns404() {
    assertThrows(HttpClientErrorException.NotFound.class,
        () -> rest.getForEntity(BASE + "nonexistent", String.class));
  }
}