plugins {
    id("java")
    id("org.jetbrains.intellij.platform") version "2.19.0"
}

java {
    // since-build 253 runs on Java 21
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
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
        // "What's New" on the Marketplace: the CHANGELOG.md section of the current version, as simple HTML.
        // Computed at configuration time (a script function inside a lazy provider breaks the configuration
        // cache); providers.fileContents makes CHANGELOG.md a tracked configuration input.
        changeNotes = changelogSectionHtml(
            providers.fileContents(layout.projectDirectory.file("CHANGELOG.md")).asText.get(),
            providers.gradleProperty("pluginVersion").get(),
        )
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

tasks.named<Zip>("buildPlugin") {
    archiveBaseName = "norte"
}

// Sandbox IDE for visual checks: opens samples/ (plus -PsampleFile=sample.ts, optional) and skips
// first-run dialogs. idea.is.internal enables Tools > Internal Actions > UI (LaF Defaults, UI Inspector).
tasks.named<JavaExec>("runIde") {
    val samplesDir = layout.projectDirectory.dir("samples").asFile
    val sampleFile = providers.gradleProperty("sampleFile").orNull
    args(listOfNotNull(samplesDir.absolutePath, sampleFile?.let { samplesDir.resolve(it).absolutePath }))
    jvmArgs(
        "-Didea.is.internal=true",
        "-Didea.trust.all.projects=true",
        "-Djb.consents.confirmation.enabled=false",
        "-Didea.initially.ask.config=never",
        "-Dide.show.tips.on.startup.default.value=false",
    )
}

// Generated themes must exist before packaging (they are produced by the converter and committed).
tasks.named("processResources") {
    val themesDir = layout.projectDirectory.dir("src/main/resources/themes").asFile
    doFirst {
        val count = themesDir.listFiles()?.count { it.name.endsWith(".theme.json") || it.name.endsWith(".xml") } ?: 0
        if (count < 10) throw GradleException("Themes not generated. Run: cd converter && npm run build")
    }
}

/** Converts the "## [version]" section of CHANGELOG.md (### headings and "- " items) to HTML. */
fun changelogSectionHtml(changelog: String, version: String): String {
    val section = changelog.lines()
        .dropWhile { !it.startsWith("## [$version]") }.drop(1)
        .takeWhile { !it.startsWith("## ") }
    check(section.any { it.isNotBlank() }) { "CHANGELOG.md has no section for version $version" }
    fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        .replace(Regex("`([^`]+)`"), "<code>$1</code>")
    val html = StringBuilder()
    var inList = false
    for (line in section.map { it.trim() }.filter { it.isNotEmpty() }) {
        if (line.startsWith("- ")) {
            if (!inList) { html.append("<ul>"); inList = true }
            html.append("<li>").append(esc(line.removePrefix("- "))).append("</li>")
        } else {
            if (inList) { html.append("</ul>"); inList = false }
            html.append(if (line.startsWith("### ")) "<h3>${esc(line.removePrefix("### "))}</h3>" else "<p>${esc(line)}</p>")
        }
    }
    if (inList) html.append("</ul>")
    return html.toString()
}
