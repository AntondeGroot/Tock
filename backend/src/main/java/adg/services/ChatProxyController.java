package adg.services;

import jakarta.annotation.PreDestroy;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Proxies /chat/** to the chat server running on port 4100 (GameRoom service).
 * Active in all environments so the keezen app can reach the chat server
 * without requiring a separate nginx rule for /chat/.
 */
@RestController
@RequestMapping("/chat")
public class ChatProxyController {

  private static final String CHAT_SERVER_BASE_URL = "http://localhost:4100";
  private final HttpClient httpClient = HttpClient.newHttpClient();
  private final ExecutorService streamExecutor = Executors.newVirtualThreadPerTaskExecutor();

  /**
   * Interrupts open proxy streams when the app is undeployed: inside the shared Tomcat the JVM
   * outlives the app, and a thread still blocked on the chat server would pin the old classes.
   */
  @PreDestroy
  void shutdown() {
    streamExecutor.shutdownNow();
  }

  @GetMapping(value = "/{sessionId}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public SseEmitter streamMessages(
      @PathVariable("sessionId") String sessionId, HttpServletResponse response) {
    response.setHeader("X-Accel-Buffering", "no");
    SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);
    streamExecutor.execute(() -> proxyStream(sessionId, emitter));
    return emitter;
  }

  private void proxyStream(String sessionId, SseEmitter emitter) {
    String url = CHAT_SERVER_BASE_URL + "/chat/" + sessionId + "/stream";
    try {
      HttpURLConnection conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
      conn.setRequestProperty("Accept", "text/event-stream");
      conn.setConnectTimeout(5_000);
      conn.setReadTimeout(0);
      conn.connect();

      try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
        StringBuilder data = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
          if (line.startsWith("data: ")) {
            data.append(line.substring(6));
          } else if (line.isBlank() && !data.isEmpty()) {
            emitter.send(SseEmitter.event().data(data.toString(), MediaType.APPLICATION_JSON));
            data.setLength(0);
          }
        }
      }
      emitter.complete();
    } catch (Exception e) {
      emitter.completeWithError(e);
    }
  }

  @GetMapping("/{sessionId}")
  public ResponseEntity<String> getChatMessages(@PathVariable("sessionId") String sessionId) {
    return proxy(sessionId, "GET", null);
  }

  @PostMapping("/{sessionId}")
  public ResponseEntity<String> sendChatMessage(
      @PathVariable("sessionId") String sessionId, @RequestBody String body) {
    return proxy(sessionId, "POST", body);
  }

  private ResponseEntity<String> proxy(String sessionId, String method, String body) {
    String targetUrl = CHAT_SERVER_BASE_URL + "/chat/" + sessionId;
    try {
      HttpRequest.Builder builder = HttpRequest.newBuilder()
          .uri(URI.create(targetUrl))
          .header("Content-Type", "application/json");

      if ("POST".equals(method)) {
        builder.POST(body != null
            ? HttpRequest.BodyPublishers.ofString(body)
            : HttpRequest.BodyPublishers.noBody());
      } else {
        builder.GET();
      }

      HttpResponse<String> response = httpClient.send(
          builder.build(), HttpResponse.BodyHandlers.ofString());

      return ResponseEntity.status(response.statusCode())
          .header("Content-Type", "application/json")
          .header("Access-Control-Allow-Origin", "*")
          .body(response.body());

    } catch (IOException | InterruptedException e) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }
  }
}