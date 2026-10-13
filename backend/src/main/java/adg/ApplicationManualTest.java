package adg;

import adg.keezen.GameRegistry;
import adg.keezen.GameSession;
import adg.keezen.GameState;
import com.adg.openapi.model.Player;
import java.io.File;
import java.util.Objects;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.boot.web.servlet.ServletComponentScan;
import org.springframework.boot.web.servlet.server.ConfigurableServletWebServerFactory;
import org.springframework.stereotype.Component;

@SpringBootApplication
@ServletComponentScan
// Not a SpringBootServletInitializer: Tomcat starts every initializer in the WAR, and only
// Application should run there.
public class ApplicationManualTest {

  public static void main(String[] args) {
    int NrPlayers = 3;

    SpringApplication.run(ApplicationManualTest.class, args);
    String sessionId = GameRegistry.createTestGame("123");
    GameSession session = GameRegistry.getGameOrThrow(sessionId);
    GameState gameState = session.getGameState();
    if (gameState.getPawns().isEmpty()) {
      for (int i = 0; i < NrPlayers; i++) {
        Player player = new Player("player" + i, String.valueOf(i));
        if (i == 0) {
          player.setIsPlaying(true);
        }
        gameState.addPlayer(player);
      }
    }
    // todo: remove testdata
    // todo: replace with isRunning method
    if (gameState.getPawns().isEmpty()) {
      gameState.start();
    }
  }


  @Component
  public static class EmbeddedServletContainerConfig
      implements WebServerFactoryCustomizer<ConfigurableServletWebServerFactory> {
    @Override
    public void customize(ConfigurableServletWebServerFactory factory) {
      File laucherDirDirectory =
          new File(Objects.requireNonNull(getClass().getResource("/")).getFile(), "launcherDir");
      if (laucherDirDirectory.exists()) {
        // You have to set a document root here, otherwise RemoteServiceServlet will failed to find
        // the
        // corresponding serializationPolicyFilePath on a temporary web server started by spring
        // boot application:
        // servlet.getServletContext().getResourceAsStream(serializationPolicyFilePath) returns
        // null.
        // This has impact that java.io.Serializable can be no more used in RPC, only IsSerializable
        // works.
        factory.setDocumentRoot(laucherDirDirectory);
      }
    }
  }
}
