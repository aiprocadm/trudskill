from .utils import greet


def generate_greeting(name: str) -> str:
    """Return a personalized greeting for the given name."""
    return greet(name)


def main() -> None:
    """Print a greeting to the console."""
    print(generate_greeting("World"))


if __name__ == "__main__":
    main()
