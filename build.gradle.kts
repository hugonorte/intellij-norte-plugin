plugins {
    id("java")
    id("org.jetbrains.intellij.platform") version "2.19.0"
}

group = providers.gradleProperty("pluginGroup").get()
version = providers.gradleProperty("pluginVersion").get()

repositories {
    mavenCentral()
    intellijPlatform { defaultRepositories() }
}

dependencies {
    intellijPlatform {
        // Since 2025.3 IntelliJ IDEA ships as a single distribution: intellijIdea() replaces intellijIdeaCommunity().
        intellijIdea(providers.gradleProperty("platformVersion"))
        pluginVerifier()
    }
}

intellijPlatform {
    // A theme plugin has no code: skip searchable options and instrumentation.
    buildSearchableOptions = false
    instrumentCode = false

    pluginConfiguration {
        name = providers.gradleProperty("pluginName")
        version = providers.gradleProperty("pluginVersion")
        ideaVersion {
            sinceBuild = providers.gradleProperty("pluginSinceBuild")
            untilBuild = provider { null } // pure theme: no upper bound
        }
    }
    pluginVerification {
        ides { recommended() }
    }
    signing {
        certificateChain = providers.environmentVariable("CERTIFICATE_CHAIN")
        privateKey = providers.environmentVariable("PRIVATE_KEY")
        password = providers.environmentVariable("PRIVATE_KEY_PASSWORD")
    }
    publishing {
        token = providers.environmentVariable("PUBLISH_TOKEN")
    }
}

// Generated themes must exist before packaging (they are produced by the converter and committed).
val themesDir = layout.projectDirectory.dir("src/main/resources/themes").asFile
tasks.named("processResources") {
    doFirst {
        val count = themesDir.listFiles()?.count { it.name.endsWith(".theme.json") || it.name.endsWith(".xml") } ?: 0
        check(count >= 2) { "Themes not generated. Run: cd converter && npm run build" }
    }
}
