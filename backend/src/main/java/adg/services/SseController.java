package adg.services;

import adg.keezen.GameRegistry;
import adg.keezen.GameSession;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
public class SseController {

  @Autowired private SseEmitterService sseEmitterService;

  @GetMapping(value = "/gamestates/{sessionId}/{playerId}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public SseEmitter subscribeToGameState(
      @PathVariable("sessionId") String sessionId,
      @PathVariable("playerId") String playerId,
      HttpServletResponse response) {
    response.setHeader("X-Accel-Buffering", "no");
    GameSession session = GameRegistry.getGame(sessionId);
    if (session == null) {
      return SseEmitterService.gameEndedStream();
    }
    SseEmitter emitter = sseEmitterService.subscribe(sessionId, playerId);
    try {
      GameStatePush initial = sseEmitterService.buildPush(session, playerId, true);
      emitter.send(SseEmitter.event().name("gamestate").data(initial, MediaType.APPLICATION_JSON));
    } catch (IOException e) {
      emitter.completeWithError(e);
    }
    return emitter;
  }
}