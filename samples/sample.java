package norte.samples;

import java.util.List;
import java.util.function.Function;

/**
 * Javadoc for {@link Sample}.
 * @param <T> element type
 */
@SuppressWarnings("unused")
public class Sample<T extends Comparable<T>> implements Runnable {
    private static final int LIMIT = 0x10;
    private final List<T> items;
    private int counter = 42;

    public Sample(List<T> items) {
        this.items = items;
    }

    @Override
    public void run() {
        Function<T, String> fn = value -> String.valueOf(value) + "\t";
        for (T item : items) {
            if (counter++ > LIMIT) break;
            System.out.println(fn.apply(item));
        }
    }
}
