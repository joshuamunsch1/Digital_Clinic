matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]

dp = [[1 for j in range(len(matrix[0]))] for i in range(len(matrix))]
longest = 0

def memo(x,y):
    if x > 0 and matrix[y][x-1] > matrix[y][x]:
        dp[y][x] = max(dp[y][x],memo(x-1,y) + 1)

    if x < len(matrix[0])-1 and matrix[y][x+1] > matrix[y][x]:
        dp[y][x] = max(dp[y][x], memo(x+1,y) + 1)

    if y > 0 and matrix[y-1][x] > matrix[y][x]:
        dp[y][x] = max(dp[y][x], memo(x,y-1) + 1)

    if y < len(matrix)-1 and matrix[y+1][x] > matrix[y][x]:
        dp[y][x] = max(dp[y][x], memo(x,y+1) + 1)

    return dp[y][x] 


for i in range(len(matrix)):
    for j in range(len(matrix[0])):
        if dp[i][j] != 1:
            continue
        memo(j,i)        

    for row in dp:
        print(row)

    print('')