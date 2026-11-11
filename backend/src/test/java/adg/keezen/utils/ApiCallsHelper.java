package adg.keezen.utils;

import com.adg.openapi.model.NewGameRequest;
import com.adg.openapi.model.Player;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

//todo: make methods and class variables static
public class ApiCallsHelper {

  private final RestTemplate restTemplate;
  private final String baseUrl = "http://localhost:4200";

  private static final ParameterizedTypeReference<Map<String, Object>> MAP_TYPE =
      new ParameterizedTypeReference<>() {};
  private static final ParameterizedTypeReference<List<Map<String, Object>>> LIST_TYPE =
      new ParameterizedTypeReference<>() {};

  public ApiCallsHelper() {
    this.restTemplate = new RestTemplate();
  }

  // ---------- GAMES ----------
  public List<Map<String, Object>> getAllGames() {
    String url = baseUrl + "/games";
    ResponseEntity<List<Map<String, Object>>> response = restTemplate.exchange(url, HttpMethod.GET, null, LIST_TYPE);
    return response.getBody();
  }

  public String createNewGame(String roomName, int maxPlayers) {
    return createNewGameWithOptions(roomName, maxPlayers, Map.of());
  }

  public String createNewGameWithOptions(String roomName, int maxPlayers, Map<String, Object> options) {
    NewGameRequest request = new NewGameRequest();
    request.setRoomName(roomName);
    request.setMaxPlayers(maxPlayers);
    options.forEach(request::putGameOptionsItem);
    String url = baseUrl + "/games";
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    HttpEntity<NewGameRequest> entity = new HttpEntity<>(request, headers);
    ResponseEntity<Map<String, Object>> response = restTemplate.exchange(url, HttpMethod.POST, entity, MAP_TYPE);
    return response.getBody().get("sessionId").toString();
  }

  public void startGameForTesting(String sessionId) {
    restTemplate.postForEntity(baseUrl + "/test/start-game/" + sessionId, null, Void.class);
  }

  public void stopGame(String sessionId) {
    restTemplate.delete(baseUrl + "/games/" + sessionId);
  }

  // ---------- PLAYERS ----------
  public List<Map<String, Object>> getAllPlayersInGame(String sessionId) {
    String url =
        UriComponentsBuilder.fromUriString(baseUrl + "/games/{sessionId}/players")
            .buildAndExpand(sessionId)
            .toString();
    ResponseEntity<List<Map<String, Object>>> response = restTemplate.exchange(url, HttpMethod.GET, null, LIST_TYPE);
    return response.getBody();
  }

  public String addPlayerToGame(String sessionId, Player player) {
    String url = baseUrl + "/games/" + sessionId + "/players";
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    ResponseEntity<Map<String, Object>> response =
        restTemplate.exchange(url, HttpMethod.POST, new HttpEntity<>(player, headers), MAP_TYPE);
    return response.getBody().get("playerId").toString();
  }

  // ---------- MOVES ----------
  public Map<String, Object> makeMove(
      String sessionId, String playerId, Map<String, Object> moveRequest) {
    String url = baseUrl + "/moves/" + sessionId + "/" + playerId;
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    HttpEntity<Map<String, Object>> entity = new HttpEntity<>(moveRequest, headers);
    ResponseEntity<Map<String, Object>> response = restTemplate.exchange(url, HttpMethod.POST, entity, MAP_TYPE);
    return response.getBody();
  }

  public Map<String, Object> checkMove(
      String sessionId, String playerId, Map<String, Object> moveRequest) {
    String url = baseUrl + "/moves/" + sessionId + "/" + playerId + "/test";
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    HttpEntity<Map<String, Object>> entity = new HttpEntity<>(moveRequest, headers);
    ResponseEntity<Map<String, Object>> response = restTemplate.exchange(url, HttpMethod.POST, entity, MAP_TYPE);
    return response.getBody();
  }

  /** Returns the raw response so callers can assert the status (200 body / 204 empty / 404 throws). */
  public ResponseEntity<Map<String, Object>> getLastMove(String sessionId) {
    String url = baseUrl + "/moves/" + sessionId + "/last";
    return restTemplate.exchange(url, HttpMethod.GET, null, MAP_TYPE);
  }

  // ---------- CARDS ----------
  public Map<String, Object> getPubliclyAvailableCardInformation(String sessionId) {
    String url = baseUrl + "/cards/" + sessionId;
    ResponseEntity<Map<String, Object>> response = restTemplate.exchange(url, HttpMethod.GET, null, MAP_TYPE);
    return response.getBody();
  }

  public List<Map<String, Object>> getPlayerCards(String sessionId, String playerId) {
    String url = baseUrl + "/cards/" + sessionId + "/" + playerId;
    ResponseEntity<List<Map<String, Object>>> response = restTemplate.exchange(url, HttpMethod.GET, null, LIST_TYPE);
    return response.getBody();
  }

  public void playerForfeits(String sessionId, String playerId) {
    restTemplate.delete(baseUrl + "/cards/" + sessionId + "/" + playerId);
  }

  public int leaveGame(String sessionId, String playerId) {
    String url = baseUrl + "/games/" + sessionId + "/players/" + playerId;
    ResponseEntity<Void> response = restTemplate.exchange(url, HttpMethod.DELETE, null, Void.class);
    return response.getStatusCode().value();
  }

  public void setCardForPlayer(String playerId, int cardValue) {
    restTemplate.postForEntity(
        baseUrl + "/test/set-card/" + playerId + "/" + cardValue, null, Void.class);
  }

  public void setCardForPlayer(String sessionId, String playerId, int cardValue) {
    restTemplate.postForEntity(
        baseUrl + "/test/set-card/" + sessionId + "/" + playerId + "/" + cardValue, null, Void.class);
  }

  public void setOnlyCardForPlayer(String sessionId, String playerId, int cardValue) {
    restTemplate.postForEntity(
        baseUrl + "/test/set-only-card/" + sessionId + "/" + playerId + "/" + cardValue, null, Void.class);
  }

  /** Replaces the player's whole hand with these card values; each card's uuid is its value. */
  public void setHandForPlayer(String sessionId, String playerId, int... cardValues) {
    String values =
        Arrays.stream(cardValues)
            .mapToObj(String::valueOf)
            .collect(Collectors.joining(","));
    restTemplate.postForEntity(
        baseUrl + "/test/set-hand/" + sessionId + "/" + playerId + "/" + values, null, Void.class);
  }

  public void simulateMustPlayTimeout(String sessionId) {
    restTemplate.postForEntity(
        baseUrl + "/test/simulate-must-play-timeout/" + sessionId, null, Void.class);
  }

  public void setPawnPosition(String sessionId, String playerId, int pawnNr, String sectionOwnerId, int tileNr) {
    restTemplate.postForEntity(
        baseUrl + "/test/set-pawn/" + sessionId + "/" + playerId + "/" + pawnNr + "/" + sectionOwnerId + "/" + tileNr,
        null, Void.class);
  }

  // ---------- TRADE ----------
  /** Posts a team trade action (a TradeAction as JSON); throws on a refused action. */
  public void teamTrade(String sessionId, String tradeActionJson) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    restTemplate.postForEntity(
        baseUrl + "/trade/" + sessionId, new HttpEntity<>(tradeActionJson, headers), Void.class);
  }

  // ---------- GAME STATES ----------
  public Map<String, Object> getGameState(String sessionId) {
    String url = baseUrl + "/gamestates/" + sessionId;
    ResponseEntity<Map<String, Object>> response = restTemplate.exchange(url, HttpMethod.GET, null, MAP_TYPE);
    return response.getBody();
  }

  public Map<String, Object> getGameDetails(String sessionId) {
    String url = baseUrl + "/games/" + sessionId;
    ResponseEntity<Map<String, Object>> response = restTemplate.exchange(url, HttpMethod.GET, null, MAP_TYPE);
    return response.getBody();
  }
}
