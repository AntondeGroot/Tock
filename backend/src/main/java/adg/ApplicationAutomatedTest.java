package adg;

import java.io.File;
import java.util.Objects;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.boot.web.servlet.ServletComponentScan;
import org.springframework.boot.web.servlet.server.ConfigurableServletWebServerFactory;
import org.springframework.stereotype.Component;

@SpringBootApplication
@ServletComponentScan
// Not a SpringBootServletInitializer: Tomcat starts every initializer in the WAR, and only
// Application should run there.
public class ApplicationAutomatedTest {

  /***
   * This class CANNOT use a main method,
   * otherwise the selenium tests cannot start and stop the server
   */


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
