const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function maskIp(ip: string | null | undefined): string | null {
    if (ip == null) {
        return null;
    }

    const trimmed = ip.trim();

    if (!trimmed) {
        return null;
    }

    const lower = trimmed.toLowerCase();

    if (
        lower === "localhost" ||
        lower === "::1" ||
        lower === "127.0.0.1" ||
        lower === "0:0:0:0:0:0:0:1"
    ) {
        return "localhost";
    }

    const ipv4Match = IPV4_PATTERN.exec(trimmed);

    if (ipv4Match) {
        return `${ipv4Match[1]}.${ipv4Match[2]}.${ipv4Match[3]}.xxx`;
    }

    if (trimmed.includes(":")) {
        const segments = trimmed.split(":").filter((segment) => segment.length > 0);

        if (segments.length === 0) {
            return "::1";
        }

        if (segments.length <= 3) {
            return trimmed;
        }

        return `${segments.slice(0, 3).join(":")}:xxxx`;
    }

    return null;
}
