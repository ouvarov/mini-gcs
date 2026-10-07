/** Dense 4x4 row-major matrix and 4-vector on Float64Array, enough for a constant-velocity filter. */

type Vector4 = Float64Array
type Matrix4x4 = Float64Array

const SIZE = 4

const index = (row: number, column: number): number => row * SIZE + column

const identityMatrix = (): Matrix4x4 => {
  const matrix = new Float64Array(SIZE * SIZE)
  for (let diagonal = 0; diagonal < SIZE; diagonal++) matrix[index(diagonal, diagonal)] = 1
  return matrix
}

const diagonalMatrix = (diagonalValues: [number, number, number, number]): Matrix4x4 => {
  const matrix = new Float64Array(SIZE * SIZE)
  diagonalValues.forEach((value, diagonal) => {
    matrix[index(diagonal, diagonal)] = value
  })
  return matrix
}

const multiplyMatrices = (left: Matrix4x4, right: Matrix4x4): Matrix4x4 => {
  const product = new Float64Array(SIZE * SIZE)
  for (let row = 0; row < SIZE; row++) {
    for (let column = 0; column < SIZE; column++) {
      let sum = 0
      for (let inner = 0; inner < SIZE; inner++)
        sum += left[index(row, inner)] * right[index(inner, column)]
      product[index(row, column)] = sum
    }
  }
  return product
}

const multiplyMatrixVector = (matrix: Matrix4x4, vector: Vector4): Vector4 => {
  const product = new Float64Array(SIZE)
  for (let row = 0; row < SIZE; row++) {
    let sum = 0
    for (let column = 0; column < SIZE; column++) sum += matrix[index(row, column)] * vector[column]
    product[row] = sum
  }
  return product
}

const transposeMatrix = (matrix: Matrix4x4): Matrix4x4 => {
  const transposed = new Float64Array(SIZE * SIZE)
  for (let row = 0; row < SIZE; row++) {
    for (let column = 0; column < SIZE; column++)
      transposed[index(column, row)] = matrix[index(row, column)]
  }
  return transposed
}

const addMatrices = (left: Matrix4x4, right: Matrix4x4): Matrix4x4 =>
  left.map((leftValue, position) => leftValue + right[position])
const subtractMatrices = (left: Matrix4x4, right: Matrix4x4): Matrix4x4 =>
  left.map((leftValue, position) => leftValue - right[position])
const addVectors = (left: Vector4, right: Vector4): Vector4 =>
  left.map((leftValue, position) => leftValue + right[position])
const subtractVectors = (left: Vector4, right: Vector4): Vector4 =>
  left.map((leftValue, position) => leftValue - right[position])

/** Gauss-Jordan without pivoting: valid because the innovation covariance is symmetric positive definite. */
const invertMatrix = (matrix: Matrix4x4): Matrix4x4 => {
  const reduced = new Float64Array(matrix)
  const inverse = identityMatrix()
  for (let pivotRow = 0; pivotRow < SIZE; pivotRow++) {
    const pivot = reduced[index(pivotRow, pivotRow)]
    for (let column = 0; column < SIZE; column++) {
      reduced[index(pivotRow, column)] /= pivot
      inverse[index(pivotRow, column)] /= pivot
    }
    for (let row = 0; row < SIZE; row++) {
      if (row === pivotRow) continue
      const eliminationFactor = reduced[index(row, pivotRow)]
      for (let column = 0; column < SIZE; column++) {
        reduced[index(row, column)] -= eliminationFactor * reduced[index(pivotRow, column)]
        inverse[index(row, column)] -= eliminationFactor * inverse[index(pivotRow, column)]
      }
    }
  }
  return inverse
}

export {
  index,
  identityMatrix,
  diagonalMatrix,
  multiplyMatrices,
  multiplyMatrixVector,
  transposeMatrix,
  addMatrices,
  subtractMatrices,
  addVectors,
  subtractVectors,
  invertMatrix,
}
export type { Vector4, Matrix4x4 }
