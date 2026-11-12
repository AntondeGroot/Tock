package adg.services;

import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Sends the game-state streams their heartbeat on a fixed beat, so a client that went away without
 * closing its stream is cleaned up within one beat. Fifteen seconds also stays well under the
 * 60 seconds after which a proxy such as nginx closes a connection that has been quiet.
 */
@Component
@EnableScheduling
public class SseHeartbeat {

  private static final long BEAT_SECONDS = 15;

  @Autowired private SseEmitterService sseEmitterService;

  @Scheduled(fixedRate = BEAT_SECONDS, timeUnit = TimeUnit.SECONDS)
  void beat() {
    sseEmitterService.sendHeartbeats();
  }
}
