package adg;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.RestController;

/**
 * Static architecture rules over the production classes (tests excluded). These codify the
 * layering the code already follows so it cannot silently erode.
 */
@AnalyzeClasses(packages = "adg", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

  /** Game logic and utilities must not reach up into the web layer. */
  @ArchTest
  static final ArchRule gameLogicIsIndependentOfTheWebLayer =
      noClasses()
          .that()
          .resideInAnyPackage("adg.keezen..", "adg.processing..", "adg.util..")
          .should()
          .dependOnClassesThat()
          .resideInAPackage("adg.services..");

  /** util is a leaf: it must not depend on any other adg feature package. */
  @ArchTest
  static final ArchRule utilIsALeaf =
      noClasses()
          .that()
          .resideInAPackage("adg.util..")
          .should()
          .dependOnClassesThat()
          .resideInAnyPackage("adg.keezen..", "adg.services..", "adg.processing..");

  /** Web components live in the services package, nowhere else. */
  @ArchTest
  static final ArchRule webComponentsLiveInServices =
      classes()
          .that()
          .areAnnotatedWith(RestController.class)
          .or()
          .areAnnotatedWith(Service.class)
          .should()
          .resideInAPackage("adg.services..");

  /**
   * Feature packages must form a DAG. Without this, a convenience delegate on one side of a
   * boundary quietly turns a one-way dependency into a cycle.
   */
  @ArchTest
  static final ArchRule featurePackagesAreFreeOfCycles =
      slices().matching("adg.(*)..").should().beFreeOfCycles();

  /**
   * The root package composes the application (entry point, servlet filters); feature packages
   * must never depend back up onto it. Shared helpers belong in adg.util, not in the root.
   *
   * <p>Note: classes directly in "adg" are invisible to the slice rule above (a slice needs at
   * least one subpackage), so this cycle needs its own rule.
   */
  @ArchTest
  static final ArchRule featurePackagesDoNotDependOnTheApplicationRoot =
      noClasses()
          .that()
          .resideInAnyPackage("adg.keezen..", "adg.processing..", "adg.services..", "adg.util..")
          .should()
          .dependOnClassesThat()
          .resideInAPackage("adg");
}
