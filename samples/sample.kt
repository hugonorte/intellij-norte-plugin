package norte.samples

data class User(val name: String, var age: Int = 0)

enum class Level { LOW, HIGH }

/** Greets [user]. */
fun greet(user: User, level: Level = Level.LOW): String {
    val prefix = if (level == Level.HIGH) "HELLO" else "hello"
    return "$prefix, ${user.name}! (${user.age})"
}

fun main() {
    val users = listOf(User("Ana", 30), User(name = "Bia"))
    users.filter { it.age > 18 }.forEach { println(greet(it)) }
}
