import math

def java_int(x: float, eps: float = 1e-9) -> int:
    """
    Simulate Java's (int) cast (which truncates toward zero)
    but also mimics the possibility that due to floating-point arithmetic,
    a value like 200099.999999999 becomes 200099.
    
    For positive numbers, subtract a tiny epsilon before applying floor;
    for negative numbers, add epsilon before applying ceil.
    """
    if x >= 0:
        return math.floor(x - eps)
    else:
        return math.ceil(x + eps)

def compute_relative_coords(explosionX: float, explosionZ: float,
                            playerX: float, playerZ: float,
                            viewDistance: float) -> (int, int):
    """
    Given:
      - explosion position (explosionX, explosionZ) (absolute coordinates)
      - player's position (playerX, playerZ)
      - viewDistance (in blocks) from the server (i.e. getCraftServer().getViewDistance()*16)
    
    If the player is farther than viewDistance from the explosion,
    compute:
        relative = player + ( (explosion - player) / distance ) * viewDistance
    and then convert each coordinate to int (truncation toward zero as Java does).
    
    Otherwise, return the explosion's block position (using math.floor).
    """
    deltaX = explosionX - playerX
    deltaZ = explosionZ - playerZ
    distance_sq = deltaX * deltaX + deltaZ * deltaZ
    
    if distance_sq > viewDistance * viewDistance:
        distance = math.sqrt(distance_sq)
        relativeX = playerX + (deltaX / distance) * viewDistance
        relativeZ = playerZ + (deltaZ / distance) * viewDistance
        return java_int(relativeX), java_int(relativeZ)
    else:
        return math.floor(explosionX), math.floor(explosionZ)

# -------------------------
# Example test data
# Assume the explosion's absolute (block) position is (1e6, 1e6).
explosionX = 1_000_000
explosionZ = 1_000_000

# The viewDistance is computed as getCraftServer().getViewDistance()*16.
# For these examples we assume it is 160.
viewDistance = 160

# Test cases with players and expected output.
# Each entry is a tuple: (playerX, playerZ, expectedRelX, expectedRelZ)
test_cases = [
    (200000,   0,         200099,  124),
    (0,       -200000,     102,    -199877),
    (0,        200000,     124,    200099),
    (-200000,   0,        -199877,  102),
    (-100000, -100000,     -99886,  -99886),
    (100000,  100000,      100113,  100113),
    (100000, -100000,      100101,  -99876),
    (-100000,  100000,      -99876,  100101),
]

print("Explosion at: ({}, {})".format(explosionX, explosionZ))
print("View Distance: {}\n".format(viewDistance))

for idx, (pX, pZ, expRelX, expRelZ) in enumerate(test_cases, 1):
    relX, relZ = compute_relative_coords(explosionX, explosionZ, pX, pZ, viewDistance)
    print(f"Test case {idx}:")
    print(f"  Player at ({pX}, {pZ})")
    print(f"  Computed relative: ({relX}, {relZ})  Expected: ({expRelX}, {expRelZ})\n")
