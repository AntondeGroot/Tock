package adg.util;

/***
 * do not System.out.println() when in CI environment
 */
public class Log {
  private static final boolean isCI = "true".equalsIgnoreCase(System.getenv("CI"));

  public static void info(String message) {
    if (!isCI) {
//      System.out.println(message);
    }
  }
}
